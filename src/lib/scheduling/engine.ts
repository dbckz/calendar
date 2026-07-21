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
// Categories with no weeklyCount (e.g. a catch-all "General Todos") are skipped
// — without a target count there is nothing to fill toward.

import { classifyBlockCategory, normalize, parseTargetLength, type CapacityQuota } from '@/lib/capacity';
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

// Does [start, end] have `buffer` minutes of clearance from every busy interval?
function slotIsFree(start: number, end: number, buffer: number, busy: BusyMs[]): boolean {
  const bufferMs = buffer * MS_PER_MINUTE;
  const paddedStart = start - bufferMs;
  const paddedEnd = end + bufferMs;
  for (const b of busy) {
    // Conflict when the busy interval overlaps the padded region. Exact
    // boundary touching (busy ends exactly `buffer` before start) is allowed.
    if (b.start < paddedEnd && b.end > paddedStart) return false;
  }
  return true;
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
// given windows, respecting buffer and the now-cutoff.
export function findSlot(
  windows: Window[],
  duration: number,
  buffer: number,
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
      if (start >= nowMs && slotIsFree(start, end, buffer, busy)) {
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
  buffer: number;
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
  const buffer = parseTargetLength(scheduling.bufferBetweenTasks);
  const workingDays = buildWorkingDays(
    weekStart,
    now,
    { start: workingHoursStart, end: workingHoursEnd },
    workingDayNames
  );
  return { workingHoursStart, workingHoursEnd, workingDayNames, buffer, workingDays };
}

export function proposeBlocks(input: ProposeBlocksInput): ProposedBlock[] {
  const { config, candidateTasks } = input;

  const { workingHoursEnd, buffer, workingDays } = resolveWorkingWindow(
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
    const category = classifyBlockCategory(task.typeSignals, quotas);
    if (!category) continue;
    const list = tasksByCategory.get(category) ?? [];
    list.push(task);
    tasksByCategory.set(category, list);
  }
  for (const list of tasksByCategory.values()) {
    list.sort((a, b) => compareKeys(taskSortKey(a), taskSortKey(b)));
  }

  // Remaining quota per category.
  const remainingByCategory = new Map<string, number>();
  for (const quota of quotas) {
    const weeklyCount = quota.weeklyCount ?? 0;
    if (weeklyCount <= 0) continue; // catch-all / no target -> skip
    const already = input.existingScheduledCounts[quota.category] ?? 0;
    const remaining = Math.max(0, weeklyCount - already);
    if (remaining > 0) remainingByCategory.set(quota.category, remaining);
  }

  // Category processing order: the Writing/Deep Work category is processed
  // FIRST so it claims the earliest morning slots before other categories fill
  // them; then hard-deadline categories first, then by remaining quota desc,
  // then name. Deep work is matched via the whitespace-robust normalize so
  // "Writing / Deep Work" and "Writing/Deep Work" are treated the same.
  const categoryHasHard = (category: string): boolean =>
    (tasksByCategory.get(category) ?? []).some(t => t.deadlineType === 'hard');

  const orderedCategories = [...remainingByCategory.keys()].sort((a, b) => {
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
  }));
  const usedTaskIds = new Set<string>();
  const nowMs = input.now.getTime();
  const proposals: ProposedBlock[] = [];

  const quotaByCategory = new Map(quotas.map(q => [q.category, q]));

  for (const category of orderedCategories) {
    const quota = quotaByCategory.get(category)!;
    const duration =
      input.durationOverridesByCategory?.[category] ?? (parseTargetLength(quota.targetLength) || 30);
    const preferredWindows = preferredWindowsForCategory(config, category, workingHoursEnd);

    let remaining = remainingByCategory.get(category)!;
    const categoryTasks = tasksByCategory.get(category) ?? [];
    const grouped = config.taskQuotas[category]?.grouped === true;

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
    const findLeveledSlot = (windows: Window[]) => {
      let slot: ReturnType<typeof findSlot> = null;
      for (let level = 0; level <= 7 && !slot; level++) {
        const allowed = new Set(
          workingDays.filter(wd => catCount[wd.dateStr] <= level).map(wd => wd.dateStr)
        );
        slot = findSlot(windows, duration, buffer, busy, nowMs, allowed);
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
        const slot = findLeveledSlot(windows);
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
          durationMinutes: duration,
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

      const windows = buildWindowsForTask(task?.bestTime, preferredWindows, workingDays);
      const slot = findLeveledSlot(windows);
      if (!slot) break; // no more room this week for this category

      const start = timeStr(slot.startMs);
      const blockId = `${slot.dateStr}-${start}-${category}`;

      if (task) {
        const id = task.gid ?? task.adhocId!;
        usedTaskIds.add(id);
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
