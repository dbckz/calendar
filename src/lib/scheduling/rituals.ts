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

import type { SchedulingConfig, WorkflowConfig } from '@/lib/workflow-config-storage';
import type { CalendarEvent } from '@/types';

import {
  localDateStr,
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
// Explicit break events placed after each ~2h work run (see breaks.ts). Tracked
// in the ritualBlocks store like the daily rituals so reconcile / reset / replan
// sweeps cover them.
export const BREAK_TITLE = '☕ Break';
export const RITUAL_TITLES: readonly string[] = [
  LUNCH_TITLE,
  EXERCISE_TITLE,
  EMAILS_TITLE,
  BREAK_TITLE,
];

// The ritual/break kinds. Lunch + exercise + break are BREAKS (split work runs);
// emails counts as WORK.
export type RitualKind = 'lunch' | 'exercise' | 'emails' | 'break';

// Lunch + exercise + break are breaks (split work runs); emails counts as work.
// A calendar event titled exactly like any of them is treated as a break by the
// run rule so it keeps work runs split.
export function isLunchTitle(title: string): boolean {
  return title.trim() === LUNCH_TITLE;
}
export function isExerciseTitle(title: string): boolean {
  return title.trim() === EXERCISE_TITLE;
}
export function isBreakTitle(title: string): boolean {
  const t = title.trim();
  return t === LUNCH_TITLE || t === EXERCISE_TITLE || t === BREAK_TITLE;
}
export function isRitualTitle(title: string): boolean {
  return RITUAL_TITLES.includes(title.trim());
}
// Resolve a ritual/break title to its kind. A non-ritual title falls back to
// 'emails' (callers pass ritual titles only; the fallback keeps the return total).
export function ritualKindForTitle(title: string): RitualKind {
  const t = title.trim();
  if (t === EXERCISE_TITLE) return 'exercise';
  if (t === LUNCH_TITLE) return 'lunch';
  if (t === BREAK_TITLE) return 'break';
  return 'emails';
}

// Per-kind ritual calendar routing. Exercise (and the break events, which are
// also green/non-work and belong on the same personal calendar) resolve to the
// exercise calendar; lunch + emails resolve to their own calendar, falling back
// to the legacy single `ritualGoogleIntegrationId` so existing configs still work.
// Returns undefined when nothing is configured for the kind → caller uses the
// default Google integration.
export function ritualIntegrationIdForKind(
  scheduling: Pick<SchedulingConfig, 'ritualCalendars' | 'ritualGoogleIntegrationId'>,
  kind: RitualKind
): string | undefined {
  const cals = scheduling.ritualCalendars;
  const legacy = scheduling.ritualGoogleIntegrationId;
  if (kind === 'exercise' || kind === 'break') return cals?.exercise;
  if (kind === 'lunch') return cals?.lunch ?? legacy;
  return cals?.emails ?? legacy; // emails
}

// The ritual calendar for a proposed ritual/break block (by its exact title).
export function ritualIntegrationIdForBlock(
  scheduling: Pick<SchedulingConfig, 'ritualCalendars' | 'ritualGoogleIntegrationId'>,
  title: string
): string | undefined {
  return ritualIntegrationIdForKind(scheduling, ritualKindForTitle(title));
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

// Build the per-date set of ritual titles already present on the calendar this
// week (exact-match on the ritual titles), so an existing ritual — including one
// added manually — is never duplicated. Keyed by yyyy-MM-dd. Shared by every
// route that places rituals so the dedupe convention stays in one place.
export function existingRitualTitlesByDateFromEvents(
  weekEvents: CalendarEvent[]
): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  for (const e of weekEvents) {
    if (e.allDay) continue;
    const title = e.title?.trim();
    if (!title || !RITUAL_TITLES.includes(title)) continue;
    const dateStr = localDateStr(e.startTime);
    (out[dateStr] ??= new Set<string>()).add(title);
  }
  return out;
}

// Assemble proposeRitualBlocks inputs from the week context and place this
// week's rituals. Both the propose route and the prep-candidates route call this
// with identical inputs, so a ritual placement is deterministic across the two
// steps (given the same busy set): the prep step reserves the ritual slots (so
// prep never steals the 15:00 exercise slot), and the propose step re-derives the
// same slots because the accepted prep it adds to busy never overlaps them.
export function placeWeekRituals(params: {
  config: WorkflowConfig;
  weekEvents: CalendarEvent[];
  busyIntervals: BusyInterval[];
  weekStart: Date;
  now: Date;
}): ProposedBlock[] {
  return proposeRitualBlocks({
    config: params.config,
    busyIntervals: params.busyIntervals,
    weekStart: params.weekStart,
    now: params.now,
    existingRitualTitlesByDate: existingRitualTitlesByDateFromEvents(params.weekEvents),
  });
}

// Convert a proposed block's date + HH:mm + duration into a busy interval so
// callers can add accepted prep/ritual blocks to the busy set. A break ritual
// (lunch / exercise) is tagged as a break (splits work runs); everything else
// counts as work.
export function proposedBlockToBusyInterval(block: ProposedBlock): BusyInterval {
  const [y, mo, d] = block.date.split('-').map(Number);
  const [h, m] = block.start.split(':').map(Number);
  const start = new Date(y, mo - 1, d, h, m, 0, 0);
  const end = new Date(start.getTime() + block.durationMinutes * MS_PER_MINUTE);
  const isBreak =
    block.kind === 'break' ||
    (block.kind === 'ritual' && !!block.title && isBreakTitle(block.title));
  return { start, end, ...(isBreak ? { isBreak: true } : {}) };
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

    // --- Exercise (break) — NUMBER ONE priority: it must land EVERY working day.
    // Ideally starting at 15:00, else the free 60-min slot whose start is closest
    // to 15:00, searched outward within 13:00–18:00. When nothing fits in that
    // core window, widen the search to the ENTIRE working day (still closest to
    // 15:00); only skip the day when no free 60-min slot exists at all. ---
    if (!present.has(EXERCISE_TITLE)) {
      let startMs = findClosestFreeSlot(
        msAtDay(day, 15, 0),
        msAtDay(day, 13, 0),
        msAtDay(day, 18, 0),
        exerciseDurationMs,
        busy,
        nowMs
      );
      if (startMs === null) {
        startMs = findClosestFreeSlot(
          msAtDay(day, 15, 0),
          day.whStartMs,
          day.whEndMs,
          exerciseDurationMs,
          busy,
          nowMs
        );
      }
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
