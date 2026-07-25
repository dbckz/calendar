// Pure attribution of calendar time to an Asana workspace (OM / DBC / …).
//
// THE CALENDAR IS THE SOURCE OF TRUTH. Dave moves things around on his Google
// calendars to reflect how he actually worked, so an event counts toward the
// workspace whose calendar it sits on — however it got there. A meeting someone
// else booked on the OM calendar is OM work; a block he typed straight into that
// calendar is OM work; an app-scheduled block is OM work. The old rule only
// counted events the APP could tie back to an Asana task, which silently
// dropped meetings, hand-made blocks and every ritual.
//
// I/O-free so the client can apply it to today's events and the rules stay
// unit-testable.

import type { CalendarEvent } from '@/types';
import { isBreakLikeTitle } from '@/lib/scheduling/rituals';

// Google event types that are never work time. 'default' and 'focusTime' are.
//  * birthday / workingLocation — calendar furniture, not time spent,
//  * fromGmail — Gmail-derived reminders (flights, deliveries): a reminder, not
//    a meeting,
//  * outOfOffice — the opposite of working.
const NON_WORK_EVENT_TYPES = new Set(['birthday', 'workingLocation', 'fromGmail', 'outOfOffice']);

// Which Asana workspace a calendar belongs to. Both maps are keyed by id and
// resolve to an Asana integration id.
export interface WorkspaceCalendarMap {
  // Google integration id → Asana integration id. Derived from each Asana
  // integration's `eventGoogleIntegrationId` (the routing that already decides
  // where that workspace's task events are created), so the mapping follows the
  // config Dave already maintains rather than a second source of truth.
  byGoogleIntegration: Record<string, string>;
  // Google SUB-calendar id → Asana integration id, for the case a single Google
  // account holds calendars for different workspaces (e.g. a consulting calendar
  // living inside the personal account). Optional, from
  // `scheduling.calendarWorkspaceMap`; takes precedence over the integration map.
  byCalendar: Record<string, string>;
}

export function buildWorkspaceCalendarMap(
  asanaIntegrations: Array<{ id: string; eventGoogleIntegrationId?: string }>,
  calendarWorkspaceMap?: Record<string, string>
): WorkspaceCalendarMap {
  const byGoogleIntegration: Record<string, string> = {};
  for (const asana of asanaIntegrations) {
    // Only an EXPLICIT routing claims a calendar. A workspace with no routing
    // falls back to the default Google integration when creating events, but
    // that default is usually the personal account — claiming it wholesale
    // would count birthdays and family events as client work.
    if (asana.eventGoogleIntegrationId) {
      byGoogleIntegration[asana.eventGoogleIntegrationId] = asana.id;
    }
  }
  return { byGoogleIntegration, byCalendar: { ...(calendarWorkspaceMap ?? {}) } };
}

// Is this event time spent working at all? Attribution is a separate question —
// an event can be countable here and still belong to no workspace.
export function isCountableWorkEvent(event: CalendarEvent): boolean {
  // All-day entries are not a measurable slice of the day. This is also what
  // keeps reminders out: Google Tasks / reminders surface as all-day items, and
  // this app's own Reminders feature is Google Tasks-backed, so it never
  // produces a timed calendar event in the first place.
  if (event.allDay) return false;
  // Declined meetings are free time — the same rule the planner's free/busy uses.
  if (event.selfResponseStatus === 'declined') return false;
  if (event.eventType && NON_WORK_EVENT_TYPES.has(event.eventType)) return false;
  // Breaks are not work: lunch, exercise and the post-run break, whether the app
  // created them (emoji title) or Dave typed them in himself. The WORK rituals
  // (emails, kindle notes, grooming, retrospective) deliberately DO count.
  if (isBreakLikeTitle(event.title)) return false;
  // Zero-length or malformed intervals contribute nothing.
  const ms = event.endTime.getTime() - event.startTime.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return false;
  return true;
  // Note: an event Dave dismissed as "not a task" in the daily review still
  // counts. Dismissing means "don't ask me to tick this off", not "this time
  // didn't happen" — it was still time spent on that workspace's calendar.
}

export interface AttributionContext {
  map: WorkspaceCalendarMap;
  // Manual Google-event → workspace attributions (googleEventAttributions).
  attributionByEventId?: Record<string, { asanaIntegrationId: string } | undefined>;
}

// The Asana workspace an event's time belongs to, or null for "counts toward
// neither" (e.g. a personal-calendar event with no explicit link).
//
// Precedence, most specific first:
//   1. an explicit task link / Asana-sourced event — the app knows the exact
//      workspace, and it wins even if the event sits on another calendar,
//   2. a manual attribution Dave set on that specific event,
//   3. the calendar it lives on (sub-calendar mapping, then integration).
export function attributeEventToWorkspace(
  event: CalendarEvent,
  ctx: AttributionContext
): string | null {
  const direct =
    event.linkedAsanaIntegrationId || (event.source === 'asana' ? event.integrationId : undefined);
  if (direct) return direct;

  const manual = ctx.attributionByEventId?.[event.id]?.asanaIntegrationId;
  if (manual) return manual;

  if (event.calendarId && ctx.map.byCalendar[event.calendarId]) {
    return ctx.map.byCalendar[event.calendarId];
  }
  if (event.integrationId && ctx.map.byGoogleIntegration[event.integrationId]) {
    return ctx.map.byGoogleIntegration[event.integrationId];
  }
  return null;
}

export interface AttributedMinutes {
  // Full length of every countable, attributed event today.
  scheduled: Record<string, number>;
  // The part that has already elapsed (clamped to `nowMs`), so a bar fills
  // through the day instead of jumping to 100% the moment the day is planned.
  worked: Record<string, number>;
}

// Split a day's events into scheduled and worked minutes per workspace. Both
// figures come from the SAME filter and attribution, so they always agree.
export function attributeMinutes(
  events: CalendarEvent[],
  ctx: AttributionContext,
  nowMs: number
): AttributedMinutes {
  const scheduled: Record<string, number> = {};
  const worked: Record<string, number> = {};

  for (const event of events) {
    if (!isCountableWorkEvent(event)) continue;
    const workspaceId = attributeEventToWorkspace(event, ctx);
    if (!workspaceId) continue;

    const startMs = event.startTime.getTime();
    const endMs = event.endTime.getTime();
    scheduled[workspaceId] = (scheduled[workspaceId] || 0) + (endMs - startMs) / 60000;

    const elapsedMs = Math.min(endMs, nowMs) - startMs;
    if (elapsedMs > 0) worked[workspaceId] = (worked[workspaceId] || 0) + elapsedMs / 60000;
  }

  return { scheduled, worked };
}
