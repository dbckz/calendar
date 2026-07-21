// Pure meeting-prep block placement.
//
// Given the week's meetings that need preparation (already AI/user-decided
// upstream), proposePrepBlocks books a prep block for each (duration
// configurable via prepDurationMinutes, default 15): the day
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
}

export interface ProposePrepInput {
  meetings: PrepMeeting[];
  config: WorkflowConfig;
  busyIntervals: BusyInterval[];
  weekStart: Date;
  now: Date;
  // Length of each prep block in minutes; defaults to 15 when absent/invalid.
  prepDurationMinutes?: number;
}

export function proposePrepBlocks(
  input: ProposePrepInput
): { placed: ProposedBlock[]; unplaced: PrepMeeting[] } {
  const { config, weekStart, now } = input;
  const prepDuration = input.prepDurationMinutes ?? DEFAULT_PREP_DURATION_MINUTES;

  const { buffer, workingDays } = resolveWorkingWindow(config.scheduling, weekStart, now);
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

    // (a) Day before, anywhere in working hours.
    const dayBeforeStr = localDateStr(new Date(meeting.startMs - MS_PER_DAY));
    let slot = tryDay(dayByDateStr.get(dayBeforeStr));

    // (b) Day of, before the meeting (minus buffer).
    if (!slot) {
      const dayOf = dayByDateStr.get(meeting.date);
      if (dayOf) {
        const endMs = meeting.startMs - buffer * MS_PER_MINUTE;
        slot = tryDay(dayOf, endMs);
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
  // (12:00 → end) so mornings stay free for deep work, then the full
  // working-hours window. An optional end cap (day-of case, so prep ends before
  // the meeting) applies to BOTH windows, keeping day-of prep for morning
  // meetings working.
  function tryDay(
    day: { dateStr: string; whStartMs: number; whEndMs: number } | undefined,
    endCapMs?: number
  ): { startMs: number; endMs: number; dateStr: string; preferred: boolean } | null {
    if (!day) return null;
    const endMs = endCapMs !== undefined ? Math.min(day.whEndMs, endCapMs) : day.whEndMs;
    if (endMs <= day.whStartMs) return null;

    const afternoonStartMs = new Date(new Date(day.whStartMs).setHours(12, 0, 0, 0)).getTime();
    const windows: Window[] = [];
    // Afternoon window first (only when it is non-empty and starts within hours).
    if (afternoonStartMs > day.whStartMs && afternoonStartMs < endMs) {
      windows.push({
        date: new Date(day.whStartMs),
        dateStr: day.dateStr,
        startMs: afternoonStartMs,
        endMs,
        preferred: false,
        bestTimeMatch: false,
      });
    }
    // Full working-hours window as the fallback.
    windows.push({
      date: new Date(day.whStartMs),
      dateStr: day.dateStr,
      startMs: day.whStartMs,
      endMs,
      preferred: false,
      bestTimeMatch: false,
    });
    return findSlot(windows, prepDuration, buffer, busy, nowMs);
  }
}
