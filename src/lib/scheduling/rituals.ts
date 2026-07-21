// Pure daily-ritual block placement (lunch + exercise + emails).
//
// Every working day should get, if missing:
//   * 🍽️ Lunch — 30 min, ideally 11:30–13:00 (else nearest free 30-min slot in
//     11:00–14:00; else skipped). Counts as a BREAK for the work-run rule.
//   * 🏋️ Exercise — 60 min, ideally starting at 15:00 (else the free 60-min slot
//     whose start is CLOSEST to 15:00, searched outward within 13:00–18:00; else
//     skipped). Counts as a BREAK for the work-run rule (like lunch).
//   * 📧 Emails — 30 min, toward the END of the working day (last free 30-min slot
//     in the final 2 hours, falling back earlier in the afternoon; else skipped).
//     Counts as WORK for the work-run rule.
//
// Like prep.ts / engine.ts this is I/O-free and deterministic: every input is
// passed in and the output is a plain list of ProposedBlocks, so the propose
// route stays thin and the logic is unit-testable.

import type { WorkflowConfig } from '@/lib/workflow-config-storage';

import {
  resolveWorkingWindow,
  timeStr,
  type BusyMs,
  type WorkingDay,
} from './engine';
import type { BusyInterval, ProposedBlock } from './types';

// Exact ritual event titles. Shared so free/busy tagging, dedupe, reset sweeping
// and replan all agree on the convention instead of hard-coding the literals.
export const LUNCH_TITLE = '🍽️ Lunch';
export const EXERCISE_TITLE = '🏋️ Exercise';
export const EMAILS_TITLE = '📧 Emails';
export const RITUAL_TITLES: readonly string[] = [LUNCH_TITLE, EXERCISE_TITLE, EMAILS_TITLE];

// The three ritual kinds. Lunch + exercise are BREAKS (split work runs); emails
// counts as WORK.
export type RitualKind = 'lunch' | 'exercise' | 'emails';

// Lunch + exercise are breaks (split work runs); emails counts as work. A
// calendar event titled exactly like either break ritual is treated as a break
// by the run rule.
export function isLunchTitle(title: string): boolean {
  return title.trim() === LUNCH_TITLE;
}
export function isExerciseTitle(title: string): boolean {
  return title.trim() === EXERCISE_TITLE;
}
export function isBreakTitle(title: string): boolean {
  const t = title.trim();
  return t === LUNCH_TITLE || t === EXERCISE_TITLE;
}
export function isRitualTitle(title: string): boolean {
  return RITUAL_TITLES.includes(title.trim());
}
// Resolve a ritual title to its kind. A non-ritual title falls back to 'emails'
// (callers pass ritual titles only; the fallback keeps the return total).
export function ritualKindForTitle(title: string): RitualKind {
  const t = title.trim();
  if (t === EXERCISE_TITLE) return 'exercise';
  if (t === LUNCH_TITLE) return 'lunch';
  return 'emails';
}

const MS_PER_MINUTE = 60 * 1000;
const SLOT_STEP_MINUTES = 15;
const RITUAL_DURATION_MINUTES = 30;
const EXERCISE_DURATION_MINUTES = 60;

export interface ProposeRitualsInput {
  config: WorkflowConfig;
  busyIntervals: BusyInterval[];
  weekStart: Date;
  now: Date;
  // Per-date set of ritual titles already present on the calendar that day
  // (exact-match on "🍽️ Lunch" / "📧 Emails"), so an existing ritual is not
  // duplicated. Keyed by yyyy-MM-dd.
  existingRitualTitlesByDate: Record<string, Set<string>>;
}

// Absolute ms for an hour/minute on a working day (local).
function msAtDay(day: WorkingDay, h: number, m: number): number {
  return new Date(
    day.date.getFullYear(),
    day.date.getMonth(),
    day.date.getDate(),
    h,
    m,
    0,
    0
  ).getTime();
}

function ceilToStep(ms: number): number {
  const stepMs = SLOT_STEP_MINUTES * MS_PER_MINUTE;
  return Math.ceil(ms / stepMs) * stepMs;
}

function overlapsBusy(start: number, end: number, busy: BusyMs[]): boolean {
  for (const b of busy) {
    if (b.start < end && b.end > start) return true;
  }
  return false;
}

// Scan a [winStart, winEnd) window on the 15-min grid for a free duration-long
// slot (>= now, no overlap with busy). Returns the earliest free start, or the
// latest when `latestFirst`, or null when none fits.
function findFreeSlot(
  winStartMs: number,
  winEndMs: number,
  durationMs: number,
  busy: BusyMs[],
  nowMs: number,
  latestFirst: boolean
): number | null {
  const stepMs = SLOT_STEP_MINUTES * MS_PER_MINUTE;
  let start = ceilToStep(Math.max(winStartMs, nowMs));
  let last: number | null = null;
  while (start + durationMs <= winEndMs) {
    if (start >= nowMs && !overlapsBusy(start, start + durationMs, busy)) {
      if (!latestFirst) return start;
      last = start;
    }
    start += stepMs;
  }
  return last;
}

// Scan a [winStart, winEnd) window on the 15-min grid for the free duration-long
// slot (>= now, no overlap with busy) whose START is CLOSEST to `targetMs`. Ties
// (equal distance on either side) prefer the earlier start for determinism.
// Returns null when no slot fits. Used to anchor exercise near 15:00.
function findClosestFreeSlot(
  targetMs: number,
  winStartMs: number,
  winEndMs: number,
  durationMs: number,
  busy: BusyMs[],
  nowMs: number
): number | null {
  const stepMs = SLOT_STEP_MINUTES * MS_PER_MINUTE;
  const earliest = ceilToStep(Math.max(winStartMs, nowMs));
  const candidates: number[] = [];
  for (let start = earliest; start + durationMs <= winEndMs; start += stepMs) {
    candidates.push(start);
  }
  candidates.sort((a, b) => {
    const da = Math.abs(a - targetMs);
    const db = Math.abs(b - targetMs);
    if (da !== db) return da - db;
    return a - b; // equal distance → earlier start wins
  });
  for (const start of candidates) {
    if (start >= nowMs && !overlapsBusy(start, start + durationMs, busy)) return start;
  }
  return null;
}

export function proposeRitualBlocks(input: ProposeRitualsInput): ProposedBlock[] {
  const { config, weekStart, now, existingRitualTitlesByDate } = input;
  const { workingDays } = resolveWorkingWindow(config.scheduling, weekStart, now);
  const nowMs = now.getTime();
  const durationMs = RITUAL_DURATION_MINUTES * MS_PER_MINUTE;
  const exerciseDurationMs = EXERCISE_DURATION_MINUTES * MS_PER_MINUTE;

  // Mutable run state so lunch/emails never collide with each other or meetings.
  const busy: BusyMs[] = input.busyIntervals.map(i => ({
    start: i.start.getTime(),
    end: i.end.getTime(),
    isBreak: i.isBreak,
  }));

  const proposals: ProposedBlock[] = [];

  for (const day of workingDays) {
    const present = existingRitualTitlesByDate[day.dateStr] ?? new Set<string>();

    // --- Lunch (break) — ideal 11:30–13:00, fallback 11:00–14:00 ---
    if (!present.has(LUNCH_TITLE)) {
      let startMs = findFreeSlot(
        msAtDay(day, 11, 30),
        msAtDay(day, 13, 0),
        durationMs,
        busy,
        nowMs,
        false
      );
      if (startMs === null) {
        startMs = findFreeSlot(
          msAtDay(day, 11, 0),
          msAtDay(day, 14, 0),
          durationMs,
          busy,
          nowMs,
          false
        );
      }
      if (startMs !== null) {
        const start = timeStr(startMs);
        proposals.push({
          id: `${day.dateStr}-${start}-ritual-lunch`,
          category: 'Lunch',
          kind: 'ritual',
          title: LUNCH_TITLE,
          date: day.dateStr,
          start,
          durationMinutes: RITUAL_DURATION_MINUTES,
          reason: 'Daily lunch break.',
        });
        // Lunch is a break: still busy, but splits work runs.
        busy.push({ start: startMs, end: startMs + durationMs, isBreak: true });
      }
    }

    // --- Exercise (break) — ideally starting at 15:00, else the free 60-min slot
    // whose start is closest to 15:00, searched outward within 13:00–18:00 ---
    if (!present.has(EXERCISE_TITLE)) {
      const startMs = findClosestFreeSlot(
        msAtDay(day, 15, 0),
        msAtDay(day, 13, 0),
        msAtDay(day, 18, 0),
        exerciseDurationMs,
        busy,
        nowMs
      );
      if (startMs !== null) {
        const start = timeStr(startMs);
        proposals.push({
          id: `${day.dateStr}-${start}-ritual-exercise`,
          category: 'Exercise',
          kind: 'ritual',
          title: EXERCISE_TITLE,
          date: day.dateStr,
          start,
          durationMinutes: EXERCISE_DURATION_MINUTES,
          reason: 'Daily exercise.',
        });
        // Exercise is a break: still busy, but splits work runs.
        busy.push({ start: startMs, end: startMs + exerciseDurationMs, isBreak: true });
      }
    }

    // --- Emails (work) — end of the day: last free slot in the final 2 hours,
    // falling back to the wider afternoon (latest-first keeps it near day-end) ---
    if (!present.has(EMAILS_TITLE)) {
      const finalTwoHoursStart = day.whEndMs - 2 * 60 * MS_PER_MINUTE;
      let startMs = findFreeSlot(
        Math.max(finalTwoHoursStart, day.whStartMs),
        day.whEndMs,
        durationMs,
        busy,
        nowMs,
        true
      );
      if (startMs === null) {
        startMs = findFreeSlot(
          Math.max(msAtDay(day, 12, 0), day.whStartMs),
          day.whEndMs,
          durationMs,
          busy,
          nowMs,
          true
        );
      }
      if (startMs !== null) {
        const start = timeStr(startMs);
        proposals.push({
          id: `${day.dateStr}-${start}-ritual-emails`,
          category: 'Emails',
          kind: 'ritual',
          title: EMAILS_TITLE,
          date: day.dateStr,
          start,
          durationMinutes: RITUAL_DURATION_MINUTES,
          reason: 'Daily email time.',
        });
        // Emails counts as work — no isBreak flag, so it forms/extends runs.
        busy.push({ start: startMs, end: startMs + durationMs });
      }
    }
  }

  return proposals;
}
