// Pure, deterministic "Plan my week" scheduling engine.
//
// Given a workflow config, the week's busy intervals, candidate tasks and what
// is already scheduled, proposeBlocks() greedily places task blocks into free
// time to fill each category's remaining weekly quota. No I/O — every input is
// passed in and the output is a plain list of proposals, so it is heavily
// unit-testable and the API routes stay thin.
//
// Algorithm summary (documented decisions):
//  * Category order: categories that have at least one candidate with a HARD
//    deadline are processed first; within each group, by remaining quota
//    descending; ties broken by category name. (This is the "hard-deadline
//    categories first, then by remaining quota desc" option.)
//  * Task ranking within a category: deadline (hard > soft > aspirational >
//    none), then earliest due date, then energy (high first, so high-energy
//    work grabs the earlier/preferred — typically morning — slots), then
//    bestTime (morning > afternoon > evening), then title/id for stability.
//  * Slot search: for each task we build an ordered list of search windows.
//    Tier 1 is the category's PREFERRED windows (which may sit outside working
//    hours — e.g. Deep Work 21:00-23:00 — and override working hours by design),
//    ordered so windows matching the task's bestTime come first, then by date;
//    Tier 2 is the working-hours window on each working day. We first-fit the
//    earliest 15-minute-aligned slot of the category's target length that has
//    the required buffer on both sides against busy intervals AND proposals
//    already accepted in this run, and is >= now.
//  * If a category still has quota but no candidate task fits/remains, we emit a
//    task-less "reserved" block instead.
//
// Categories with no weeklyCount (e.g. a catch-all "General Todos") have no
// target to fill toward, so they emit no reserved blocks; instead they schedule
// one block per SELECTED candidate task, placed after all quota'd categories.

import { classifyBlockCategoryWithCatchAll, normalize, parseTargetLength, type CapacityQuota } from '@/lib/capacity';
import type { WorkflowConfig } from '@/lib/workflow-config-storage';
import type { BestTime } from '@/types';
import type {
  CandidateTask,
  ProposeBlocksInput,
  ProposedBlock,
} from './types';

const SLOT_STEP_MINUTES = 15;
const MS_PER_MINUTE = 60 * 1000;

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export interface TimeOfDay {
  h: number;
  m: number;
}

export interface Window {
  date: Date; // local midnight of the day
  dateStr: string; // yyyy-MM-dd
  startMs: number;
  endMs: number;
  preferred: boolean;
  bestTimeMatch: boolean;
}

export interface BusyMs {
  start: number;
  end: number;
  // Break intervals (e.g. the daily lunch ritual) are still busy but split work
  // runs — they are excluded when merging busy time into continuous work runs.
  isBreak?: boolean;
}

// The continuous-work-run rule: busy runs of at most `maxMinutes`, each followed
// by at least `bufferMinutes` of free time. Gaps smaller than `bufferMinutes`
// bridge two busy stretches into one run.
export interface WorkRun {
  maxMinutes: number;
  bufferMinutes: number;
}

// A working day in the week, with its working-hours window bounds (absolute ms).
export interface WorkingDay {
  date: Date; // local midnight of the day
  dateStr: string; // yyyy-MM-dd
  whStartMs: number;
  whEndMs: number;
}

export function parseTimeOfDay(value: string): TimeOfDay | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 24 || m < 0 || m > 59) return null;
  return { h, m };
}

// "09:00-11:00" -> [{h,m},{h,m}]
export function parsePreferredWindow(value: string): [TimeOfDay, TimeOfDay] | null {
  const parts = value.split('-');
  if (parts.length !== 2) return null;
  const start = parseTimeOfDay(parts[0]);
  const end = parseTimeOfDay(parts[1]);
  if (!start || !end) return null;
  return [start, end];
}

export function localDateStr(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

export function timeStr(ms: number): string {
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// Absolute ms for a time-of-day on a given local day.
function msAt(day: Date, time: TimeOfDay): number {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.h, time.m, 0, 0);
  return d.getTime();
}

// Round a timestamp up to the next SLOT_STEP boundary within its day.
function ceilToStep(ms: number): number {
  const stepMs = SLOT_STEP_MINUTES * MS_PER_MINUTE;
  return Math.ceil(ms / stepMs) * stepMs;
}

const BEST_TIME_RANGES: Record<BestTime, [number, number]> = {
  morning: [5, 12],
  afternoon: [12, 17],
  evening: [17, 24],
};

function windowMatchesBestTime(startMs: number, bestTime?: BestTime): boolean {
  if (!bestTime) return false;
  const hour = new Date(startMs).getHours();
  const [lo, hi] = BEST_TIME_RANGES[bestTime];
  return hour >= lo && hour < hi;
}

const DEADLINE_RANK: Record<string, number> = { hard: 0, soft: 1, aspirational: 2 };
const ENERGY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const BEST_TIME_RANK: Record<string, number> = { morning: 0, afternoon: 1, evening: 2 };

export function taskSortKey(task: CandidateTask): Array<number | string> {
  return [
    task.isPriority ? 0 : 1,
    task.deadlineType ? DEADLINE_RANK[task.deadlineType] : 3,
    task.dueDate ?? '9999-12-31',
    task.energyLevel ? ENERGY_RANK[task.energyLevel] : 1,
    task.bestTime ? BEST_TIME_RANK[task.bestTime] : 1,
    task.title,
    task.gid ?? task.adhocId ?? '',
  ];
}

export function compareKeys(a: Array<number | string>, b: Array<number | string>): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

// Is placing a work block [start, end] valid under the work-run rule?
//   (1) It must not overlap any busy interval (breaks included — a break is still
//       busy and can't be double-booked).
//   (2) The contiguous busy RUN it would join/create must be <= maxMinutes.
//       Runs are formed by merging only NON-break busy intervals (plus this
//       candidate), bridging any gap smaller than bufferMinutes; a break interval
//       is excluded from the merge, so a run interrupted by a break is two runs.
// Because a >= bufferMinutes gap splits runs, this simultaneously guarantees that
// a run already at/over maxMinutes leaves at least bufferMinutes of free time
// before the next block can be placed.
export function slotIsValid(start: number, end: number, busy: BusyMs[], workRun: WorkRun): boolean {
  // (1) No overlap with anything busy.
  for (const b of busy) {
    if (b.start < end && b.end > start) return false;
  }
  // (2) Run-length check: grow the run around the candidate across every non-break
  // busy interval within bufferMinutes, to a fixpoint (bridging can chain).
  const bufferMs = workRun.bufferMinutes * MS_PER_MINUTE;
  const maxMs = workRun.maxMinutes * MS_PER_MINUTE;
  const work = busy.filter(b => !b.isBreak);
  let runStart = start;
  let runEnd = end;
  let changed = true;
  while (changed) {
    changed = false;
    for (const w of work) {
      // Connected when within bufferMinutes on both sides (gap < bufferMinutes,
      // or overlapping). A gap of exactly bufferMinutes does NOT connect.
      if (w.start < runEnd + bufferMs && w.end > runStart - bufferMs) {
        if (w.start < runStart) {
          runStart = w.start;
          changed = true;
        }
        if (w.end > runEnd) {
          runEnd = w.end;
          changed = true;
        }
      }
    }
  }
  return runEnd - runStart <= maxMs;
}

// Build the ordered list of working days in the week (>= today), each with its
// working-hours window bounds.
export function buildWorkingDays(
  weekStart: Date,
  now: Date,
  workingHours: { start: TimeOfDay; end: TimeOfDay },
  workingDayNames: Set<string>
): WorkingDay[] {
  const days: WorkingDay[] = [];
  const todayStr = localDateStr(now);
  for (let i = 0; i < 7; i++) {
    const day = new Date(
      weekStart.getFullYear(),
      weekStart.getMonth(),
      weekStart.getDate() + i
    );
    const dateStr = localDateStr(day);
    if (dateStr < todayStr) continue; // past days in the week
    if (!workingDayNames.has(WEEKDAY_NAMES[day.getDay()])) continue;
    days.push({
      date: day,
      dateStr,
      whStartMs: msAt(day, workingHours.start),
      whEndMs: msAt(day, workingHours.end),
    });
  }
  return days;
}

// Build candidate search windows for a task (or reserved block when bestTime is
// undefined): preferred windows first (bestTime-matching first), then
// working-hours fallback windows. All ordered by date within each tier.
export function buildWindowsForTask(
  bestTime: BestTime | undefined,
  preferredWindows: Array<[TimeOfDay, TimeOfDay]>,
  workingDays: WorkingDay[]
): Window[] {
  const preferred: Window[] = [];
  for (const day of workingDays) {
    for (const [ws, we] of preferredWindows) {
      const startMs = msAt(day.date, ws);
      const endMs = msAt(day.date, we);
      if (endMs <= startMs) continue;
      preferred.push({
        date: day.date,
        dateStr: day.dateStr,
        startMs,
        endMs,
        preferred: true,
        bestTimeMatch: windowMatchesBestTime(startMs, bestTime),
      });
    }
  }
  // Within preferred tier: bestTime-matching windows first, then by date/start.
  preferred.sort((a, b) => {
    if (a.bestTimeMatch !== b.bestTimeMatch) return a.bestTimeMatch ? -1 : 1;
    return a.startMs - b.startMs;
  });

  const fallback: Window[] = workingDays.map(day => ({
    date: day.date,
    dateStr: day.dateStr,
    startMs: day.whStartMs,
    endMs: day.whEndMs,
    preferred: false,
    bestTimeMatch: false,
  }));
  fallback.sort((a, b) => a.startMs - b.startMs);

  return [...preferred, ...fallback];
}

// Find the earliest valid slot for a block of `duration` minutes across the
// given windows, respecting the work-run rule and the now-cutoff.
export function findSlot(
  windows: Window[],
  duration: number,
  workRun: WorkRun,
  busy: BusyMs[],
  nowMs: number,
  allowedDates?: Set<string>
): { startMs: number; endMs: number; dateStr: string; preferred: boolean } | null {
  const durationMs = duration * MS_PER_MINUTE;
  const stepMs = SLOT_STEP_MINUTES * MS_PER_MINUTE;

  for (const win of windows) {
    if (allowedDates && !allowedDates.has(win.dateStr)) continue;
    // Start at the window start (or now if later), aligned up to the step grid.
    let start = ceilToStep(Math.max(win.startMs, nowMs));
    while (start + durationMs <= win.endMs) {
      const end = start + durationMs;
      if (start >= nowMs && slotIsValid(start, end, busy, workRun)) {
        return { startMs: start, endMs: end, dateStr: win.dateStr, preferred: win.preferred };
      }
      start += stepMs;
    }
  }
  return null;
}

// Whether a category is the deep-work category, compared with the
// whitespace-robust normalize so "Writing / Deep Work" and "Writing/Deep Work"
// are treated the same. Deep work owns the mornings.
export function isDeepWork(category: string): boolean {
  return normalize(category) === normalize('Writing/Deep Work');
}

// Preferred-time search windows for a category: its explicit `preferredTimes` if
// configured; otherwise a default afternoon window (12:00 → working-hours end)
// for non-deep-work categories, so they try afternoons before falling back to
// mornings and leave early slots free for deep work. Deep work with no
// preferredTimes gets none (falls through to the working-hours tier, which
// starts in the morning). buildWindowsForTask drops any day whose window end <=
// start, so a day ending at/before 12:00 simply contributes no afternoon window.
export function preferredWindowsForCategory(
  config: WorkflowConfig,
  category: string,
  workingHoursEnd: TimeOfDay
): Array<[TimeOfDay, TimeOfDay]> {
  const windows = (config.taskQuotas[category]?.preferredTimes ?? [])
    .map(parsePreferredWindow)
    .filter((w): w is [TimeOfDay, TimeOfDay] => w !== null);
  if (windows.length === 0 && !isDeepWork(category)) {
    windows.push([{ h: 12, m: 0 }, workingHoursEnd]);
  }
  return windows;
}

// Resolve the scheduling config's working-hours/day settings into the derived
// values every planner (task engine, prep, replan) needs: parsed working-hours
// bounds, the working-day name set, the buffer minutes, and the ordered list of
// this week's working days (>= today) with their window bounds.
export interface WorkingWindow {
  workingHoursStart: TimeOfDay;
  workingHoursEnd: TimeOfDay;
  workingDayNames: Set<string>;
  workRun: WorkRun;
  workingDays: WorkingDay[];
}

export function resolveWorkingWindow(
  scheduling: WorkflowConfig['scheduling'],
  weekStart: Date,
  now: Date
): WorkingWindow {
  const workingHoursStart = parseTimeOfDay(scheduling.workingHours.start) ?? { h: 9, m: 0 };
  const workingHoursEnd = parseTimeOfDay(scheduling.workingHours.end) ?? { h: 17, m: 0 };
  const workingDayNames = new Set(
    scheduling.workingDays.map(d => d.charAt(0).toUpperCase() + d.slice(1).toLowerCase())
  );
  // Work-run rule, defaulted when a legacy config predates it.
  const workRun: WorkRun = {
    maxMinutes: scheduling.workRun?.maxMinutes ?? 120,
    bufferMinutes: scheduling.workRun?.bufferMinutes ?? 15,
  };
  const workingDays = buildWorkingDays(
    weekStart,
    now,
    { start: workingHoursStart, end: workingHoursEnd },
    workingDayNames
  );
  return { workingHoursStart, workingHoursEnd, workingDayNames, workRun, workingDays };
}

// A working day must never START with meeting prep: deep work / todos / meetings
// come first. Prep-block placement (and prep re-slotting in replan) excludes the
// first N minutes of each working day from its candidate windows, so prep can
// only land later in the day (or the day before). Shared so prep.ts and
// replan.ts enforce the identical rule.
export const MORNING_PREP_EXCLUSION_MINUTES = 90;

// Raise each window's start to at least (its day's working-hours start +
// exclusionMinutes), dropping any window left with no room. Windows on a date not
// in `workingDays` are passed through unchanged.
export function excludeMorningWindows(
  windows: Window[],
  workingDays: WorkingDay[],
  exclusionMinutes: number
): Window[] {
  const earliestByDate = new Map(
    workingDays.map(d => [d.dateStr, d.whStartMs + exclusionMinutes * MS_PER_MINUTE])
  );
  const out: Window[] = [];
  for (const w of windows) {
    const earliest = earliestByDate.get(w.dateStr);
    const startMs = earliest !== undefined ? Math.max(w.startMs, earliest) : w.startMs;
    if (startMs < w.endMs) out.push({ ...w, startMs });
  }
  return out;
}

// --- Spare-capacity assessment ---------------------------------------------
//
// After a plan is proposed, we want to tell the user how much *usable* free work
// time is left in the remaining week. "Usable" means: inside working hours, on a
// working day, at/after now, in a free gap big enough to hold a real block
// (>= MIN_USABLE_GAP_MINUTES) — and respecting the work-run rule, so a gap that
// sits right after an already-maxed-out work run loses the leading buffer that
// must separate it from that run (and likewise a trailing buffer before a maxed
// run that follows the gap). Breaks (e.g. lunch) occupy time but are NOT work
// runs, so a gap adjacent to a break needs no buffer.

const MIN_USABLE_GAP_MINUTES = 30;

export interface SpareCapacity {
  totalMinutes: number;
  gapCount: number;
  largestGapMinutes: number;
  byDate: Array<{ date: string; freeMinutes: number }>;
}

// Merge ms-intervals into a minimal, start-sorted set. Two consecutive intervals
// coalesce when `shouldMerge(gapMs)` holds for the gap between them (negative gap
// = overlap). Callers supply the boundary rule: overlap/touch merging vs work-run
// bridging (gap strictly below the buffer).
function mergeIntervals(
  intervals: Array<{ start: number; end: number }>,
  shouldMerge: (gapMs: number) => boolean
): Array<{ start: number; end: number }> {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out: Array<{ start: number; end: number }> = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && shouldMerge(iv.start - last.end)) last.end = Math.max(last.end, iv.end);
    else out.push({ start: iv.start, end: iv.end });
  }
  return out;
}

// Compute the usable spare capacity across the given working days, given the busy
// timeline (calendar busy + all accepted/proposed blocks) and the work-run rule.
// Pure and deterministic — every input is passed in.
export function computeSpareCapacity(
  workingDays: WorkingDay[],
  busy: BusyMs[],
  workRun: WorkRun,
  nowMs: number
): SpareCapacity {
  const bufferMs = workRun.bufferMinutes * MS_PER_MINUTE;
  const maxMs = workRun.maxMinutes * MS_PER_MINUTE;
  const minGapMs = MIN_USABLE_GAP_MINUTES * MS_PER_MINUTE;

  const byDate: Array<{ date: string; freeMinutes: number }> = [];
  let totalMinutes = 0;
  let gapCount = 0;
  let largestGapMinutes = 0;

  // Work runs are measured across the full timeline (not clipped to a day) so a
  // run's true length is known when a gap sits right after it. Non-break busy is
  // bridged into runs using the same rule as slotIsValid: a gap strictly smaller
  // than bufferMinutes joins two stretches (a gap of exactly bufferMinutes does
  // not).
  const runs = mergeIntervals(busy.filter(b => !b.isBreak), gap => gap < bufferMs);
  const runEndingAt = (t: number) => runs.find(r => Math.abs(r.end - t) < 1);
  const runStartingAt = (t: number) => runs.find(r => Math.abs(r.start - t) < 1);
  const isMaxed = (r: { start: number; end: number }) => r.end - r.start >= maxMs;

  for (const wd of workingDays) {
    // Clip the working-hours window to the now-cutoff; a fully-past day is skipped.
    const windowStart = Math.max(wd.whStartMs, nowMs);
    const windowEnd = wd.whEndMs;
    if (windowStart >= windowEnd) continue;

    // Occupied blocks (all busy incl. breaks) clipped to the window; free gaps are
    // the complement within [windowStart, windowEnd]. Overlapping/touching blocks
    // coalesce (gap <= 0).
    const occupied = mergeIntervals(
      busy
        .map(b => ({ start: Math.max(b.start, windowStart), end: Math.min(b.end, windowEnd) }))
        .filter(b => b.end > b.start),
      gap => gap <= 0
    );

    let dayFree = 0;
    let cursor = windowStart;
    for (const block of [...occupied, { start: windowEnd, end: windowEnd }]) {
      if (block.start > cursor) {
        let gapStart = cursor;
        let gapEnd = block.start;
        // A maxed work run touching this gap eats the abutting buffer.
        const left = runEndingAt(gapStart);
        if (left && isMaxed(left)) gapStart += bufferMs;
        const right = runStartingAt(gapEnd);
        if (right && isMaxed(right)) gapEnd -= bufferMs;
        const usableMs = gapEnd - gapStart;
        if (usableMs >= minGapMs) {
          const mins = Math.floor(usableMs / MS_PER_MINUTE);
          dayFree += mins;
          gapCount += 1;
          if (mins > largestGapMinutes) largestGapMinutes = mins;
        }
      }
      cursor = Math.max(cursor, block.end);
    }

    if (dayFree > 0) byDate.push({ date: wd.dateStr, freeMinutes: dayFree });
    totalMinutes += dayFree;
  }

  return { totalMinutes, gapCount, largestGapMinutes, byDate };
}

export function proposeBlocks(input: ProposeBlocksInput): ProposedBlock[] {
  const { config, candidateTasks } = input;

  const { workingHoursEnd, workRun, workingDays } = resolveWorkingWindow(
    config.scheduling,
    input.weekStart,
    input.now
  );

  // Quotas in the capacity lib's shape, for classification reuse.
  const quotas: CapacityQuota[] = Object.entries(config.taskQuotas).map(([category, quota]) => ({
    category,
    weeklyCount: quota.weeklyCount,
    targetLength: quota.targetLength,
    types: config.typeMapping?.[category] ?? [],
  }));

  // Bucket candidate tasks by category (via the shared classifier).
  const tasksByCategory = new Map<string, CandidateTask[]>();
  for (const task of candidateTasks) {
    const category = classifyBlockCategoryWithCatchAll(task.typeSignals, quotas);
    if (!category) continue;
    const list = tasksByCategory.get(category) ?? [];
    list.push(task);
    tasksByCategory.set(category, list);
  }
  for (const list of tasksByCategory.values()) {
    list.sort((a, b) => compareKeys(taskSortKey(a), taskSortKey(b)));
  }

  // Remaining "count to place" per category. Two kinds of category:
  //  * Quota'd (weeklyCount > 0): place up to the unmet weekly quota, filling
  //    with reserved blocks when candidates run out.
  //  * No-quota catch-all (no weeklyCount, e.g. "General Todos"): there is no
  //    weekly target, but the wizard still lets the user SELECT any number of its
  //    tasks. Place one block per selected candidate task (target = candidate
  //    count), never a reserved block, and process them AFTER quota'd categories
  //    so this filler can't steal morning/preferred slots from deep work etc.
  const remainingByCategory = new Map<string, number>();
  const noQuotaCategories = new Set<string>();
  for (const quota of quotas) {
    const weeklyCount = quota.weeklyCount ?? 0;
    if (weeklyCount <= 0) {
      const candidateCount = (tasksByCategory.get(quota.category) ?? []).length;
      if (candidateCount > 0) {
        remainingByCategory.set(quota.category, candidateCount);
        noQuotaCategories.add(quota.category);
      }
      continue;
    }
    const already = input.existingScheduledCounts[quota.category] ?? 0;
    const quotaRemaining = Math.max(0, weeklyCount - already);
    // Over-quota manual selection: when the user explicitly picks tasks for a
    // manual (non-auto-select, non-grouped) category, every pick should be
    // attempted even beyond the weekly quota. So place max(quotaRemaining,
    // selectedCount) blocks. Auto-select and grouped categories keep the quota
    // cap. Reserved filler only ever appears when candidates run short of
    // quotaRemaining, so it stays bounded by the quota (never over-fills).
    const isAutoSelect = config.taskQuotas[quota.category]?.autoSelect === true;
    const isGroupedCat = config.taskQuotas[quota.category]?.grouped === true;
    let remaining = quotaRemaining;
    if (!isAutoSelect && !isGroupedCat && input.selectedCountsByCategory) {
      remaining = Math.max(quotaRemaining, input.selectedCountsByCategory[quota.category] ?? 0);
    }
    if (remaining > 0) remainingByCategory.set(quota.category, remaining);
  }

  // Category processing order: no-quota catch-all categories are always LAST
  // (they're filler and must not steal slots from quota'd work). Among quota'd
  // categories, the Writing/Deep Work category is processed FIRST so it claims
  // the earliest morning slots before other categories fill them; then
  // hard-deadline categories first, then by remaining quota desc, then name.
  // Deep work is matched via the whitespace-robust normalize so
  // "Writing / Deep Work" and "Writing/Deep Work" are treated the same.
  const categoryHasHard = (category: string): boolean =>
    (tasksByCategory.get(category) ?? []).some(t => t.deadlineType === 'hard');

  const orderedCategories = [...remainingByCategory.keys()].sort((a, b) => {
    const noqA = noQuotaCategories.has(a);
    const noqB = noQuotaCategories.has(b);
    if (noqA !== noqB) return noqA ? 1 : -1; // no-quota categories last
    if (noqA && noqB) return a < b ? -1 : a > b ? 1 : 0; // among no-quota: by name
    const deepA = isDeepWork(a);
    const deepB = isDeepWork(b);
    if (deepA !== deepB) return deepA ? -1 : 1;
    const hardA = categoryHasHard(a);
    const hardB = categoryHasHard(b);
    if (hardA !== hardB) return hardA ? -1 : 1;
    const remA = remainingByCategory.get(a)!;
    const remB = remainingByCategory.get(b)!;
    if (remA !== remB) return remB - remA;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  // Mutable run state.
  const busy: BusyMs[] = input.busyIntervals.map(i => ({
    start: i.start.getTime(),
    end: i.end.getTime(),
    isBreak: i.isBreak,
  }));
  const usedTaskIds = new Set<string>();
  const nowMs = input.now.getTime();
  const proposals: ProposedBlock[] = [];

  const quotaByCategory = new Map(quotas.map(q => [q.category, q]));

  // Real selected tasks that couldn't be placed inside working hours. After the
  // normal pass they get an OPTIONAL evening-overflow block (see below). Reserved
  // filler and unmet-quota blocks are never collected here — only real tasks.
  const leftovers: Array<{ task: CandidateTask; category: string; duration: number }> = [];

  for (const category of orderedCategories) {
    const quota = quotaByCategory.get(category)!;
    // Category-level block length: an explicit per-category override, else the
    // parsed targetLength (default 30). Grouped/reserved blocks use this; a
    // single-task block may further override it per task (see below).
    const categoryDuration =
      input.durationOverridesByCategory?.[category] ?? (parseTargetLength(quota.targetLength) || 30);
    const preferredWindows = preferredWindowsForCategory(config, category, workingHoursEnd);

    let remaining = remainingByCategory.get(category)!;
    const categoryTasks = tasksByCategory.get(category) ?? [];
    const isNoQuota = noQuotaCategories.has(category);
    // Grouped mode is a quota'd behavior (places weeklyCount shared containers);
    // it never applies to a no-quota catch-all, which schedules real tasks only.
    const grouped = config.taskQuotas[category]?.grouped === true && !isNoQuota;

    // Per-date count of this category's blocks, seeded from what's already on the
    // calendar. Drives the leveled (spread) search below so same-category blocks
    // fan out across distinct days before doubling up on any one day.
    const catCount: Record<string, number> = {};
    for (const wd of workingDays) {
      catCount[wd.dateStr] = input.existingCategoryCountsByDate?.[wd.dateStr]?.[category] ?? 0;
    }

    // Leveled (spread) slot search shared by both modes: level 0 allows only days
    // with zero blocks of this category, level 1 up to one, etc. Window ordering
    // (preferred/bestTime, then working hours) is preserved within each level, so
    // spread outranks earliness but preferred times still win across distinct days.
    const findLeveledSlot = (windows: Window[], duration: number) => {
      let slot: ReturnType<typeof findSlot> = null;
      for (let level = 0; level <= 7 && !slot; level++) {
        const allowed = new Set(
          workingDays.filter(wd => catCount[wd.dateStr] <= level).map(wd => wd.dateStr)
        );
        slot = findSlot(windows, duration, workRun, busy, nowMs, allowed);
      }
      return slot;
    };

    // Grouped mode: place `remaining` reserved-style blocks (no per-block task
    // consumption), then give EVERY block the SAME full agenda — all of the
    // category's selected candidate tasks (in the engine's task sort order). Each
    // block emits a ProposedBlock with `tasks` (the whole shared list) and no
    // single `task`, so every block shares the identical outreach agenda.
    if (grouped) {
      const placed: Array<{ blockId: string; dateStr: string; start: string }> = [];
      while (remaining > 0) {
        const windows = buildWindowsForTask(undefined, preferredWindows, workingDays);
        const slot = findLeveledSlot(windows, categoryDuration);
        if (!slot) break; // no more room this week for this category
        const start = timeStr(slot.startMs);
        placed.push({ blockId: `${slot.dateStr}-${start}-${category}`, dateStr: slot.dateStr, start });
        busy.push({ start: slot.startMs, end: slot.endMs });
        catCount[slot.dateStr] = (catCount[slot.dateStr] ?? 0) + 1;
        remaining -= 1;
      }
      // The full agenda shared by every placed block (same list in each).
      const agenda = categoryTasks.map(t => ({
        gid: t.gid,
        adhocId: t.adhocId,
        title: t.title,
        integrationId: t.integrationId,
      }));
      for (const slot of placed) {
        proposals.push({
          id: slot.blockId,
          category,
          tasks: agenda,
          date: slot.dateStr,
          start: slot.start,
          durationMinutes: categoryDuration,
          reason:
            agenda.length > 0
              ? `${category} block — ${agenda.length} task${agenda.length === 1 ? '' : 's'} on the agenda.`
              : `Reserved ${category} time — no task assigned to this block.`,
        });
      }
      continue;
    }

    while (remaining > 0) {
      const task = categoryTasks.find(t => {
        const id = t.gid ?? t.adhocId;
        return id ? !usedTaskIds.has(id) : true;
      });

      // No-quota catch-all categories place only real selected tasks — never a
      // reserved filler block. Once the selected tasks are exhausted, stop.
      if (!task && isNoQuota) break;

      // A single-task block prefers this task's per-task length override; a
      // reserved block (no task) falls back to the category length. The chosen
      // duration also drives the slot search so the block is sized correctly.
      const taskId = task ? task.gid ?? task.adhocId : undefined;
      const duration =
        (taskId && input.durationOverridesByTask?.[taskId]) || categoryDuration;

      const windows = buildWindowsForTask(task?.bestTime, preferredWindows, workingDays);
      const slot = findLeveledSlot(windows, duration);
      if (!slot) {
        // No room left this week for this category inside working hours. A real
        // selected task becomes an evening-overflow candidate; the rest of this
        // category's remaining budget is collected too (they won't fit either).
        // A reserved block (no task) is never an overflow candidate.
        if (task) {
          let budget = remaining;
          for (const t of categoryTasks) {
            if (budget <= 0) break;
            const tid = t.gid ?? t.adhocId;
            if (tid && usedTaskIds.has(tid)) continue;
            if (tid) usedTaskIds.add(tid);
            leftovers.push({
              task: t,
              category,
              duration: (tid && input.durationOverridesByTask?.[tid]) || categoryDuration,
            });
            budget -= 1;
          }
        }
        break;
      }

      const start = timeStr(slot.startMs);
      const blockId = `${slot.dateStr}-${start}-${category}`;

      if (task) {
        usedTaskIds.add(taskId!);
        proposals.push({
          id: blockId,
          category,
          task: {
            gid: task.gid,
            adhocId: task.adhocId,
            title: task.title,
            integrationId: task.integrationId,
          },
          date: slot.dateStr,
          start,
          durationMinutes: duration,
          reason: buildReason(category, slot.preferred, task),
        });
      } else {
        proposals.push({
          id: blockId,
          category,
          date: slot.dateStr,
          start,
          durationMinutes: duration,
          reason: `Reserved ${category} time — quota not yet met and no matching task available.`,
        });
      }

      // Occupy the slot for the rest of the run.
      busy.push({ start: slot.startMs, end: slot.endMs });
      catCount[slot.dateStr] = (catCount[slot.dateStr] ?? 0) + 1;
      remaining -= 1;
    }
  }

  // --- Optional evening overflow -------------------------------------------
  // For real tasks that didn't fit inside working hours, try to place an OPTIONAL
  // block in the configured overflow window (e.g. 21:00–23:00) on the remaining
  // days. The overflow window sits OUTSIDE working hours, so buildWorkingDays'
  // working-hours windows don't cover it — build sibling overflow windows for the
  // same days explicitly. Calendar busy + already-placed blocks are respected and
  // the work-run rule applies within the window. Blocks are marked overflow:true
  // so the UI can offer them as opt-in (default-rejected).
  const overflowStart = config.scheduling.overflow
    ? parseTimeOfDay(config.scheduling.overflow.start)
    : null;
  const overflowEnd = config.scheduling.overflow
    ? parseTimeOfDay(config.scheduling.overflow.end)
    : null;
  if (overflowStart && overflowEnd && leftovers.length > 0) {
    const overflowWindows: Window[] = workingDays
      .map(day => ({
        date: day.date,
        dateStr: day.dateStr,
        startMs: msAt(day.date, overflowStart),
        endMs: msAt(day.date, overflowEnd),
        preferred: false,
        bestTimeMatch: false,
      }))
      .filter(w => w.endMs > w.startMs)
      .sort((a, b) => a.startMs - b.startMs);

    for (const lo of leftovers) {
      const slot = findSlot(overflowWindows, lo.duration, workRun, busy, nowMs);
      if (!slot) continue; // no room in the overflow window this week
      const start = timeStr(slot.startMs);
      proposals.push({
        id: `${slot.dateStr}-${start}-overflow-${lo.category}`,
        category: lo.category,
        kind: 'task',
        task: {
          gid: lo.task.gid,
          adhocId: lo.task.adhocId,
          title: lo.task.title,
          integrationId: lo.task.integrationId,
        },
        date: slot.dateStr,
        start,
        durationMinutes: lo.duration,
        reason: `${lo.category} — didn't fit in working hours; optional evening overflow.`,
        overflow: true,
      });
      busy.push({ start: slot.startMs, end: slot.endMs });
    }
  }

  return proposals;
}

function buildReason(category: string, preferred: boolean, task: CandidateTask): string {
  const bits: string[] = [`${category} block`];
  if (task.deadlineType === 'hard') bits.push('hard deadline');
  else if (task.deadlineType) bits.push(`${task.deadlineType} deadline`);
  if (task.dueDate) bits.push(`due ${task.dueDate}`);
  bits.push(preferred ? 'in a preferred window' : 'in working hours');
  return bits.join(', ') + '.';
}
