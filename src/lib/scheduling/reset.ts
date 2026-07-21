// Pure "start the week from scratch" decision.
//
// Resetting the week deletes the app-created blocks that are still in the FUTURE
// from the calendar (so the upcoming days clear out) but leaves past blocks on
// the calendar as history. This module makes only that past/future split — a
// deterministic, I/O-free decision the reset route feeds with the week's blocks
// and then acts on (deleting the future ones, clearing every in-week record).

import { isPrepTitle } from './event-titles';
import { RITUAL_TITLES } from './rituals';

export interface ResetEvent {
  googleEventId: string;
  googleIntegrationId?: string;
  calendarId?: string; // Google sub-calendar the event lives on (for deletion)
  startMs: number; // the block's absolute start
}

// A live calendar event as seen by the week fetch, reduced to what the
// untracked-prep decision needs. `integrationId` is the tag gather/fetchWeekEvents
// stamps on each event so a deletion can be routed to the right integration.
export interface WeekCalendarEvent {
  id: string;
  title: string;
  startMs: number;
  integrationId?: string;
  calendarId?: string;
}

export interface ResetSplit {
  // Future events (start strictly after now) → delete from the calendar.
  toDelete: ResetEvent[];
  // Past events (already started) → left on the calendar as history.
  pastKept: ResetEvent[];
}

// Split the week's app blocks into the future events to delete and the past
// events to keep. Blocks sharing a googleEventId (a grouped block records
// several tasks against one event) collapse to a single event, decided by its
// first-seen start.
export function splitWeekResetEvents(events: ResetEvent[], nowMs: number): ResetSplit {
  const seen = new Set<string>();
  const toDelete: ResetEvent[] = [];
  const pastKept: ResetEvent[] = [];

  for (const e of events) {
    if (!e.googleEventId || seen.has(e.googleEventId)) continue;
    seen.add(e.googleEventId);
    if (e.startMs > nowMs) toDelete.push(e);
    else pastKept.push(e);
  }

  return { toDelete, pastKept };
}

// Pick the FUTURE "Prep:"-titled calendar events that have NO stored record —
// prep events created before prep-block tracking existed (so they were never
// covered by splitWeekResetEvents). Reset must delete these too, otherwise they
// linger on the calendar and their "Prep:" titles suppress re-proposing prep for
// their meetings. Rules, mirroring splitWeekResetEvents:
//  - only untracked events (a tracked event id is left to the record-driven
//    split, so it is never double-counted here),
//  - only "Prep:"-titled events (a non-prep untracked event is never touched),
//  - only future events (start strictly after now); past ones are left as
//    history, consistent with the past/future split.
// `integrationId`/`calendarId` are carried through so the route can route each
// deletion to the calendar it lives on.
export function selectUntrackedPrepEvents(
  events: WeekCalendarEvent[],
  trackedEventIds: Set<string>,
  nowMs: number
): ResetEvent[] {
  const out: ResetEvent[] = [];
  const seen = new Set<string>();

  for (const e of events) {
    if (!e.id || seen.has(e.id) || trackedEventIds.has(e.id)) continue;
    if (!isPrepTitle(e.title)) continue;
    if (e.startMs <= nowMs) continue; // past → leave as history
    seen.add(e.id);
    out.push({
      googleEventId: e.id,
      googleIntegrationId: e.integrationId,
      calendarId: e.calendarId,
      startMs: e.startMs,
    });
  }

  return out;
}

// Pick the FUTURE ritual-titled ("🍽️ Lunch" / "📧 Emails") calendar events that
// have NO stored record — rituals created before ritual-block tracking existed,
// or whose record was lost. Mirrors selectUntrackedPrepEvents (exact title match,
// untracked-only, future-only) so reset clears them too and their titles don't
// suppress re-proposing the ritual for that day.
export function selectUntrackedRitualEvents(
  events: WeekCalendarEvent[],
  trackedEventIds: Set<string>,
  nowMs: number
): ResetEvent[] {
  const out: ResetEvent[] = [];
  const seen = new Set<string>();

  for (const e of events) {
    if (!e.id || seen.has(e.id) || trackedEventIds.has(e.id)) continue;
    if (!RITUAL_TITLES.includes(e.title.trim())) continue;
    if (e.startMs <= nowMs) continue; // past → leave as history
    seen.add(e.id);
    out.push({
      googleEventId: e.id,
      googleIntegrationId: e.integrationId,
      calendarId: e.calendarId,
      startMs: e.startMs,
    });
  }

  return out;
}
