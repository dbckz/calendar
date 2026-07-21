// Pure meeting-prep block placement.
//
// Given the week's meetings that need preparation (already AI/user-decided
// upstream), proposePrepBlocks books a prep block for each (per-meeting
// duration via PrepMeeting.durationMinutes, default 15): the day
// before during working hours if possible, else the day of before the meeting
// starts (leaving the configured buffer). Meetings that fit nowhere are
// returned as `unplaced`. Like the scheduling engine this is I/O-free and
// deterministic; it reuses the engine's slot-search and working-day helpers so
// prep and task blocks obey the same buffer/working-hours rules.

import type { WorkflowConfig } from '@/lib/workflow-config-storage';

import {
  findSlot,
  localDateStr,
  resolveWorkingWindow,
  timeStr,
  MORNING_PREP_EXCLUSION_MINUTES,
  type BusyMs,
  type Window,
} from './engine';
import type { BusyInterval, ProposedBlock } from './types';

const DEFAULT_PREP_DURATION_MINUTES = 15;
const PREP_CATEGORY = 'Meeting prep';
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// A meeting that needs a prep block. `startMs` is the meeting's absolute start;
// `date` is its local yyyy-MM-dd.
export interface PrepMeeting {
  eventId: string;
  title: string;
  startMs: number;
  date: string;
  // Length of this meeting's prep block in minutes; defaults to 15 when absent.
  durationMinutes?: number;
  // User's chosen day (yyyy-MM-dd) for this prep block. When set, placement tries
  // ONLY that day first (with the before-meeting end-cap when it is the meeting
  // day); if nothing fits there it falls back to the default day-before → day-of
  // search so the meeting never silently loses its prep. When absent, default
  // behaviour applies.
  preferredDate?: string;
}

export interface ProposePrepInput {
  meetings: PrepMeeting[];
  config: WorkflowConfig;
  busyIntervals: BusyInterval[];
  weekStart: Date;
  now: Date;
}

export function proposePrepBlocks(
  input: ProposePrepInput
): { placed: ProposedBlock[]; unplaced: PrepMeeting[] } {
  const { config, weekStart, now } = input;

  const { workRun, workingDays } = resolveWorkingWindow(config.scheduling, weekStart, now);
  const dayByDateStr = new Map(workingDays.map(d => [d.dateStr, d]));

  // Mutable run state shared across all preps so they never collide.
  const busy: BusyMs[] = input.busyIntervals.map(i => ({
    start: i.start.getTime(),
    end: i.end.getTime(),
  }));
  const nowMs = now.getTime();

  const placed: ProposedBlock[] = [];
  const unplaced: PrepMeeting[] = [];

  // Earlier meetings pick their prep slot first.
  const meetings = [...input.meetings].sort((a, b) => a.startMs - b.startMs);

  for (const meeting of meetings) {
    const meetingDate = new Date(meeting.startMs);
    const prepDuration = meeting.durationMinutes ?? DEFAULT_PREP_DURATION_MINUTES;

    // End-cap for a day is the meeting start only when that day IS the meeting
    // day (prep must end before the meeting begins).
    const endCapFor = (dateStr: string): number | undefined =>
      dateStr === meeting.date ? meeting.startMs : undefined;

    let slot: ReturnType<typeof tryDay> = null;

    // (0) User-preferred day, if given: try ONLY that day first.
    if (meeting.preferredDate) {
      slot = tryDay(dayByDateStr.get(meeting.preferredDate), prepDuration, endCapFor(meeting.preferredDate));
    }

    // (a) Day before, anywhere in working hours.
    if (!slot) {
      const dayBeforeStr = localDateStr(new Date(meeting.startMs - MS_PER_DAY));
      slot = tryDay(dayByDateStr.get(dayBeforeStr), prepDuration);
    }

    // (b) Day of, before the meeting starts. The work-run rule handles run
    // lengths; prep just has to end by the meeting start.
    if (!slot) {
      const dayOf = dayByDateStr.get(meeting.date);
      if (dayOf) {
        slot = tryDay(dayOf, prepDuration, meeting.startMs);
      }
    }

    if (!slot) {
      unplaced.push(meeting);
      continue;
    }

    const start = timeStr(slot.startMs);
    const reason = `Prep for "${meeting.title}" (${WEEKDAY_ABBR[meetingDate.getDay()]} ${timeStr(meeting.startMs)})`;
    placed.push({
      id: `${slot.dateStr}-${start}-prep-${meeting.eventId}`,
      category: PREP_CATEGORY,
      kind: 'prep',
      date: slot.dateStr,
      start,
      durationMinutes: prepDuration,
      reason,
      meeting: {
        eventId: meeting.eventId,
        title: meeting.title,
        meetingStart: new Date(meeting.startMs).toISOString(),
      },
    });

    busy.push({ start: slot.startMs, end: slot.endMs });
  }

  return { placed, unplaced };

  // First-fit a prep-length slot within a working day, preferring the afternoon
  // (12:00 → end) so mornings stay free for deep work, then the rest of the day.
  // The first MORNING_PREP_EXCLUSION_MINUTES of the working day are excluded from
  // BOTH windows so a day never STARTS with prep (deep work / todos / meetings go
  // first). An optional end cap (day-of case, so prep ends before the meeting)
  // also applies to both. If a meeting is so early that only the excluded window
  // could hold day-of prep, no slot is returned here — prep then falls back to
  // the day before (or unplaced), never violating the morning rule.
  function tryDay(
    day: { dateStr: string; whStartMs: number; whEndMs: number } | undefined,
    prepDuration: number,
    endCapMs?: number
  ): { startMs: number; endMs: number; dateStr: string; preferred: boolean } | null {
    if (!day) return null;
    const earliestStartMs = day.whStartMs + MORNING_PREP_EXCLUSION_MINUTES * MS_PER_MINUTE;
    const endMs = endCapMs !== undefined ? Math.min(day.whEndMs, endCapMs) : day.whEndMs;
    if (endMs <= earliestStartMs) return null;

    const noonMs = new Date(new Date(day.whStartMs).setHours(12, 0, 0, 0)).getTime();
    const afternoonStartMs = Math.max(noonMs, earliestStartMs);
    const windows: Window[] = [];
    // Afternoon window first (only when it starts after the excluded morning and
    // is non-empty).
    if (afternoonStartMs > earliestStartMs && afternoonStartMs < endMs) {
      windows.push({
        date: new Date(day.whStartMs),
        dateStr: day.dateStr,
        startMs: afternoonStartMs,
        endMs,
        preferred: false,
        bestTimeMatch: false,
      });
    }
    // Rest-of-day window (from the end of the excluded morning) as the fallback.
    windows.push({
      date: new Date(day.whStartMs),
      dateStr: day.dateStr,
      startMs: earliestStartMs,
      endMs,
      preferred: false,
      bestTimeMatch: false,
    });
    return findSlot(windows, prepDuration, workRun, busy, nowMs);
  }
}
