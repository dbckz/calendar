// Pure meeting-prep block placement.
//
// Given the week's meetings that need preparation (already AI/user-decided
// upstream), proposePrepBlocks books a 30-minute prep block for each: the day
// before during working hours if possible, else the day of before the meeting
// starts (leaving the configured buffer). Meetings that fit nowhere are
// returned as `unplaced`. Like the scheduling engine this is I/O-free and
// deterministic; it reuses the engine's slot-search and working-day helpers so
// prep and task blocks obey the same buffer/working-hours/maxTasksPerDay rules.

import { parseTargetLength } from '@/lib/capacity';
import type { WorkflowConfig } from '@/lib/workflow-config-storage';

import {
  buildWorkingDays,
  findSlot,
  localDateStr,
  parseTimeOfDay,
  timeStr,
  type BusyMs,
  type Window,
} from './engine';
import type { BusyInterval, ProposedBlock } from './types';

const PREP_DURATION_MINUTES = 30;
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
  existingBlocksByDate: Record<string, number>;
  weekStart: Date;
  now: Date;
}

export function proposePrepBlocks(
  input: ProposePrepInput
): { placed: ProposedBlock[]; unplaced: PrepMeeting[] } {
  const { config, weekStart, now } = input;
  const scheduling = config.scheduling;

  const workingHoursStart = parseTimeOfDay(scheduling.workingHours.start) ?? { h: 9, m: 0 };
  const workingHoursEnd = parseTimeOfDay(scheduling.workingHours.end) ?? { h: 17, m: 0 };
  const workingDayNames = new Set(
    scheduling.workingDays.map(d => d.charAt(0).toUpperCase() + d.slice(1).toLowerCase())
  );
  const buffer = parseTargetLength(scheduling.bufferBetweenTasks);
  const maxPerDay = scheduling.maxTasksPerDay > 0 ? scheduling.maxTasksPerDay : Infinity;

  const workingDays = buildWorkingDays(
    weekStart,
    now,
    { start: workingHoursStart, end: workingHoursEnd },
    workingDayNames
  );
  const dayByDateStr = new Map(workingDays.map(d => [d.dateStr, d]));

  // Mutable run state shared across all preps so they never collide.
  const busy: BusyMs[] = input.busyIntervals.map(i => ({
    start: i.start.getTime(),
    end: i.end.getTime(),
  }));
  const countByDate: Record<string, number> = { ...input.existingBlocksByDate };
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
      durationMinutes: PREP_DURATION_MINUTES,
      reason,
      meeting: {
        eventId: meeting.eventId,
        title: meeting.title,
        meetingStart: new Date(meeting.startMs).toISOString(),
      },
    });

    busy.push({ start: slot.startMs, end: slot.endMs });
    countByDate[slot.dateStr] = (countByDate[slot.dateStr] ?? 0) + 1;
  }

  return { placed, unplaced };

  // First-fit a prep-length slot within a working day's hours, optionally
  // capping the window end (day-of case, so prep ends before the meeting).
  function tryDay(
    day: { dateStr: string; whStartMs: number; whEndMs: number } | undefined,
    endCapMs?: number
  ): { startMs: number; endMs: number; dateStr: string; preferred: boolean } | null {
    if (!day) return null;
    const endMs = endCapMs !== undefined ? Math.min(day.whEndMs, endCapMs) : day.whEndMs;
    if (endMs <= day.whStartMs) return null;
    const window: Window = {
      date: new Date(day.whStartMs),
      dateStr: day.dateStr,
      startMs: day.whStartMs,
      endMs,
      preferred: false,
      bestTimeMatch: false,
    };
    return findSlot([window], PREP_DURATION_MINUTES, buffer, busy, nowMs, maxPerDay, countByDate);
  }
}
