// Two-way sync between planned exercise sessions and the personal Google
// calendar.
//
// The plan already lives on the calendar as all-day events — "🏋️ Push
// (shoulders) + Run (2 km)", "🏃 Parkrun + core" — and that is where Dave sees
// it day to day. So the calendar stays the visible surface: planning in the
// portal WRITES those events, and pulling READS them back, keeping the two in
// step whichever end a change is made at.
//
// Pull is keyed on the Google event id (`gcal:<id>`), so a title edited in
// Google updates the portal's session instead of creating a second one.
//
// Server-only: reaches into storage and the Google API.

import { addDays, format, parseISO } from 'date-fns';

import {
  createCalendarEvent,
  deleteCalendarEvent,
  ensureValidCredentials,
  listEventsInRange,
  updateCalendarEvent,
} from './google-calendar';
import { parsePlannedTitle } from './exercise-parse';
import { getEnabledGoogleIntegrations } from './integration-storage';
import {
  attachCalendarEvent,
  getSessionsByImportPrefix,
  deleteSession,
  upsertSessionByImportKey,
} from './storage/exercise';
import type { ExerciseSession } from '@/types/life';

const IMPORT_PREFIX = 'gcal:';

// The emoji the plan is written with, so events the portal creates look exactly
// like the ones already there.
const STRENGTH_PREFIX = '🏋️';
const RUN_PREFIX = '🏃';

export interface ExerciseCalendarTarget {
  integrationId: string;
  clientId: string;
  clientSecret: string;
  credentials: Awaited<ReturnType<typeof ensureValidCredentials>>;
  calendarId: string;
}

// Which calendar the plan lives on. Defaults to the primary calendar of the
// first enabled Google integration — that is where the existing all-day
// planning events are. `EXERCISE_CALENDAR_ID` overrides it without a code
// change if the plan ever moves to the dedicated Exercise sub-calendar.
export async function resolveCalendarTarget(): Promise<ExerciseCalendarTarget | null> {
  const integrations = await getEnabledGoogleIntegrations();
  const integration = integrations.find(i => !!i.credentials);
  if (!integration) return null;

  return {
    integrationId: integration.id,
    clientId: integration.clientId,
    clientSecret: integration.clientSecret,
    credentials: await ensureValidCredentials(integration),
    calendarId: process.env.EXERCISE_CALENDAR_ID || 'primary',
  };
}

// Build the event title from a session, mirroring the existing convention.
export function plannedEventTitle(session: {
  type: string;
  components?: string[];
  title?: string;
}): string {
  const prefix = /run|parkrun|track|cardio/i.test(session.type) ? RUN_PREFIX : STRENGTH_PREFIX;
  const body = session.components?.length
    ? session.components.join(' + ')
    : (session.title ?? session.type);
  return `${prefix} ${body}`;
}

// ---------------------------------------------------------------------------
// Pull: calendar → portal
// ---------------------------------------------------------------------------

export interface PullResult {
  scanned: number;
  created: number;
  updated: number;
  removed: number;
}

// Read planned sessions out of the calendar for a date window.
//
// Only all-day events count: a timed "🏋️ Gym" is where the session was slotted,
// not the plan itself, and treating both as plans would double-count every day.
//
// Events that have since disappeared from the calendar have their portal
// sessions removed — but ONLY if still unlogged. A session Dave has completed is
// history and is kept whatever the calendar now says.
export async function pullPlannedSessions(from: Date, to: Date): Promise<PullResult> {
  const target = await resolveCalendarTarget();
  if (!target) return { scanned: 0, created: 0, updated: 0, removed: 0 };

  const events = await listEventsInRange(
    target.credentials,
    target.clientId,
    target.clientSecret,
    from,
    to,
    target.calendarId
  );

  const allDay = events.filter(e => !!e.startDate);
  let created = 0;
  let updated = 0;
  const seen = new Set<string>();

  for (const event of allDay) {
    const parsed = parsePlannedTitle(event.summary);
    if (!parsed) continue;

    const importKey = `${IMPORT_PREFIX}${event.id}`;
    seen.add(importKey);

    const result = await upsertSessionByImportKey(importKey, {
      date: event.startDate!,
      type: parsed.type,
      label: parsed.title,
      components: parsed.components,
      ...(parsed.targetDistanceKm ? { targetDistanceKm: parsed.targetDistanceKm } : {}),
      planned: true,
      completed: false,
      googleEventId: event.id,
      googleCalendarId: target.calendarId,
      source: 'calendar',
    });
    if (result.created) created++;
    else updated++;
  }

  // Retire sessions whose event is gone from the window we just read.
  let removed = 0;
  const fromKey = format(from, 'yyyy-MM-dd');
  const toKey = format(to, 'yyyy-MM-dd');
  for (const session of await getSessionsByImportPrefix(IMPORT_PREFIX)) {
    if (session.date < fromKey || session.date > toKey) continue;
    if (seen.has(session.importKey!)) continue;
    if (session.completed) continue; // logged work is history, not a plan
    if (await deleteSession(session.id)) removed++;
  }

  return { scanned: allDay.length, created, updated, removed };
}

// ---------------------------------------------------------------------------
// Push: portal → calendar
// ---------------------------------------------------------------------------

// Create (or move/retitle) the all-day event for a planned session, and record
// the event id on the session so later edits update rather than duplicate.
//
// Returns the session unchanged when there is no calendar to write to, so
// planning still works with Google disconnected.
export async function pushPlannedSession(session: ExerciseSession): Promise<ExerciseSession> {
  const target = await resolveCalendarTarget();
  if (!target) return session;

  const title = plannedEventTitle(session);
  const start = parseISO(session.date);
  // Google's all-day events use an exclusive end date, so a single day ends on
  // the next one.
  const end = addDays(start, 1);

  if (session.googleEventId) {
    await updateCalendarEvent(
      target.credentials,
      target.clientId,
      target.clientSecret,
      session.googleEventId,
      start,
      end,
      title,
      undefined,
      target.calendarId
    );
    return session;
  }

  const created = await createCalendarEvent(
    target.credentials,
    target.clientId,
    target.clientSecret,
    title,
    start,
    end,
    undefined,
    'default',
    target.calendarId,
    // A plan shouldn't make the day look busy to anyone checking availability.
    { allDay: true, transparency: 'transparent' }
  );

  // Stamp the new event onto the EXISTING session — the session is already in
  // the portal, so creating a second one here would duplicate it. The import
  // key matches what a later pull will compute, so the two sides converge.
  const attached = await attachCalendarEvent(
    session.id,
    created.id,
    target.calendarId,
    `${IMPORT_PREFIX}${created.id}`
  );
  return attached ?? session;
}

// Remove the calendar event backing a planned session. Failure is logged, not
// thrown: the portal-side delete has already been asked for, and a stale event
// is a smaller problem than a delete that appears not to work.
export async function removePlannedEvent(session: ExerciseSession): Promise<void> {
  if (!session.googleEventId) return;
  const target = await resolveCalendarTarget();
  if (!target) return;

  try {
    await deleteCalendarEvent(
      target.credentials,
      target.clientId,
      target.clientSecret,
      session.googleEventId,
      session.googleCalendarId ?? target.calendarId
    );
  } catch (error) {
    console.error(`Failed to delete calendar event ${session.googleEventId}:`, error);
  }
}
