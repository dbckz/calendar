// Server-side reconcile of past days' time records against the live calendar.
//
// Dave retro-edits his calendar: he deletes a meeting he skipped, drags a block
// to when he actually did it, adds something he forgot. The client only records
// a day while that day is on screen in the Daily Calendar, so those edits used to
// never reach the stored record. This rebuilds each past day FROM THE CALENDAR
// and replaces that day's record outright.
//
// Division of labour: the client owns TODAY (it tracks elapsed time as the day
// runs); this owns every past day. Both apply the identical rules from
// lib/time-attribution.ts, so a day cannot change meaning as it ages out of
// today. A past day is fully elapsed, so worked === scheduled by construction.
//
// Safety: an integration whose fetch failed is NOT treated as "no events". A day
// is only rewritten from integrations that fetched cleanly, mirroring
// gather.ts's purge-only-on-successful-fetch rule, so a transient Google error
// can never wipe a day's history.

import { addDays, format, startOfWeek } from 'date-fns';

import { getEnabledGoogleIntegrations } from '@/lib/integration-storage';
import { fetchEventsForDays } from '@/lib/scheduling/gather';
import { recordDailyTime, getTimeTrackingData } from '@/lib/time-tracking-storage';
import type { EventTimeRecord, IntegrationTimeRecord } from '@/lib/time-tracking-storage';
import {
  attributeMinutes,
  buildMeetingWorkspaceByTitle,
  buildWorkspaceCalendarMap,
  type AttributionContext,
} from '@/lib/time-attribution';
import {
  getAdHocTasks,
  getScheduledAsanaTasks,
  getGoogleEventAttributions,
  recordWeeklyTime,
  getEventAttributionRules,
  getAnalysisStartDate,
  pruneWeeklyStatsBefore,
} from '@/lib/user-data-storage';
import { getEnabledAsanaIntegrations } from '@/lib/integration-storage';
import { getWorkflowConfig } from '@/lib/workflow-config-storage';
import { logicalToday, normalizeRolloverHour } from '@/lib/date-utils';
import type { AsanaIntegration, CalendarEvent } from '@/types';

// How many past days to rebuild by default, and the hard ceiling on a request.
export const DEFAULT_RECONCILE_DAYS = 14;
export const MAX_RECONCILE_DAYS = 60;

export interface ReconcileResult {
  days: number; // days examined
  updated: number; // days whose record was rewritten
  skipped: string[]; // dates left alone because no integration fetched cleanly
  at: string; // ISO completion timestamp
}

// Link a fetched Google event back to the work it represents, so the shared
// attribution sees the same task links the client does (precedence tier 1).
function enrichWithLocalRecords(
  events: CalendarEvent[],
  scheduledByEventId: Map<string, { taskId: string; integrationId?: string }>
): CalendarEvent[] {
  return events.map(event => {
    const link = scheduledByEventId.get(event.id);
    if (!link) return event;
    return {
      ...event,
      linkedAsanaTaskId: link.taskId,
      ...(link.integrationId ? { linkedAsanaIntegrationId: link.integrationId } : {}),
    };
  });
}

// Rebuild the last `days` past days (never today) from the calendar.
export async function reconcilePastDays(days = DEFAULT_RECONCILE_DAYS): Promise<ReconcileResult> {
  const requested = Math.max(1, Math.min(Math.floor(days) || DEFAULT_RECONCILE_DAYS, MAX_RECONCILE_DAYS));

  const [
    config,
    googleIntegrations,
    asanaIntegrations,
    scheduledAsana,
    adHocTasks,
    attributions,
    tracking,
    attributionRules,
    analysisStartDate,
  ] = await Promise.all([
    getWorkflowConfig(),
    getEnabledGoogleIntegrations(),
    getEnabledAsanaIntegrations(),
    getScheduledAsanaTasks(),
    getAdHocTasks(),
    getGoogleEventAttributions(),
    getTimeTrackingData(),
    getEventAttributionRules(),
    getAnalysisStartDate(),
  ]);

  // One-off (idempotent) cleanup: weeks before the analysis start date are noise
  // from before the app was in use, so they go and never come back.
  await pruneWeeklyStatsBefore(analysisStartDate);

  const rolloverHour = normalizeRolloverHour(config.scheduling?.dayRolloverHour);
  const today = logicalToday(new Date(), rolloverHour);

  // Two floors, whichever is later: the analysis start date (before it, the app
  // wasn't in use) and the first tracked day (before that there is nothing to
  // correct, and a blank stretch would be "reconciled" into existence).
  const earliestTracked = tracking.dailyRecords.map((r: { date: string }) => r.date).sort()[0];
  const floor = [analysisStartDate, earliestTracked].filter(Boolean).sort().pop()!;

  const candidateDates: string[] = [];
  for (let i = 1; i <= requested; i++) {
    const date = format(addDays(new Date(`${today}T00:00:00`), -i), 'yyyy-MM-dd');
    if (date < floor) break;
    candidateDates.push(date);
  }
  if (candidateDates.length === 0) {
    return { days: 0, updated: 0, skipped: [], at: new Date().toISOString() };
  }

  const map = buildWorkspaceCalendarMap(
    asanaIntegrations.map((i: AsanaIntegration) => ({
      id: i.id,
      eventGoogleIntegrationId: i.eventGoogleIntegrationId,
    })),
    config.scheduling?.calendarWorkspaceMap
  );
  const attributionByEventId: AttributionContext['attributionByEventId'] = {};
  for (const a of attributions) {
    attributionByEventId[a.googleEventId] = { asanaIntegrationId: a.asanaIntegrationId };
  }
  const baseCtx: AttributionContext = { map, attributionByEventId, attributionRules };

  const scheduledByEventId = new Map<string, { taskId: string; integrationId?: string }>();
  for (const s of scheduledAsana) {
    if (s.googleEventId) {
      scheduledByEventId.set(s.googleEventId, { taskId: s.asanaTaskId, integrationId: s.integrationId });
    }
  }
  for (const t of adHocTasks) {
    if (t.googleEventId) scheduledByEventId.set(t.googleEventId, { taskId: t.id });
  }

  // Prep blocks count toward the workspace of the meeting they prep for. Resolve
  // that from the WHOLE reconcile window in one fetch (a prep block's meeting may
  // sit on a different day than the prep itself), keyed by the meeting's title.
  // Built from the base context so a prep never resolves against another prep.
  const windowFetch = await fetchEventsForDays(
    googleIntegrations,
    candidateDates.map(d => new Date(`${d}T00:00:00`))
  );
  const meetingWorkspaceByNormalizedTitle = buildMeetingWorkspaceByTitle(
    enrichWithLocalRecords(windowFetch.events, scheduledByEventId),
    baseCtx
  );
  const ctx: AttributionContext = { ...baseCtx, meetingWorkspaceByNormalizedTitle };

  const nameById = new Map<string, string>(
    asanaIntegrations.map((i: AsanaIntegration) => [i.id, i.name])
  );
  const skipped: string[] = [];
  let updated = 0;

  for (const date of candidateDates) {
    const day = new Date(`${date}T00:00:00`);
    const { events, fetchedIntegrationIds } = await fetchEventsForDays(googleIntegrations, [day]);

    // Nothing fetched cleanly → leave the day's existing record untouched.
    if (fetchedIntegrationIds.size === 0) {
      skipped.push(date);
      continue;
    }

    // Only trust events from integrations that fetched cleanly, and only rewrite
    // the part of the record those integrations own — a partial failure must not
    // delete another calendar's day.
    const trusted = enrichWithLocalRecords(
      events.filter(e => e.integrationId && fetchedIntegrationIds.has(e.integrationId)),
      scheduledByEventId
    );

    // A past day has fully elapsed, so clamping to "now" is a no-op: worked
    // equals scheduled, both from the same overlap-resolved intervals.
    const attributed = attributeMinutes(trusted, ctx, Date.now());

    const integrationTotals: Record<string, IntegrationTimeRecord> = {};
    for (const [workspaceId, minutes] of Object.entries(attributed.scheduled)) {
      integrationTotals[workspaceId] = {
        integrationId: workspaceId,
        integrationName: nameById.get(workspaceId) ?? 'Unknown',
        totalMinutes: Math.round(minutes),
      };
    }

    const eventRecords: EventTimeRecord[] = attributed.events.map(e => ({
      eventId: e.eventId,
      title: e.title,
      integrationId: e.workspaceId,
      integrationName: nameById.get(e.workspaceId) ?? 'Unknown',
      startTime: new Date(e.startMs).toISOString(),
      endTime: new Date(e.endMs).toISOString(),
      durationMinutes: Math.round(e.fullMinutes),
      source: 'google',
      category: e.category,
      countedMinutes: Math.round(e.countedMinutes),
    }));

    await recordDailyTime(date, integrationTotals, eventRecords);

    await recordWeeklyTime(
      format(startOfWeek(day, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      date,
      Object.keys(attributed.scheduled).map(workspaceId => ({
        integrationId: workspaceId,
        integrationName: nameById.get(workspaceId) ?? 'Unknown',
        minutesScheduled: attributed.scheduled[workspaceId] ?? 0,
        minutesWorked: attributed.worked[workspaceId] ?? 0,
        byCategory: attributed.workedByCategory[workspaceId],
      }))
    );

    updated += 1;
  }

  return { days: candidateDates.length, updated, skipped, at: new Date().toISOString() };
}
