// Pure summarisation over a week's durable stats record.
//
// Per-category totals are DERIVED here rather than stored, so the counters can
// never drift from the underlying task list. Only outcome 'done' counts as
// completed: a task carried into next week or dropped stays in the denominator,
// which is exactly what makes over-scheduling visible after the fact.

import type { WeeklyStatsRecord, WeeklyTaskOutcome } from '@/types';
import type { CarryOverEntry } from '@/lib/storage/carry-overs';

export interface WeekCategorySummary {
  category: string;
  scheduled: number;
  completed: number;
  // Worked on but not finished. Not completed, but not a total miss either.
  started: number;
  carried: number;
  dropped: number;
}

export interface WeekIntegrationSummary {
  integrationId: string;
  integrationName: string;
  minutes: number;
}

export interface WeekSummary {
  weekStart: string;
  categories: WeekCategorySummary[];
  totalScheduled: number;
  totalCompleted: number;
  totalStarted: number;
  // Progress rate: (finished + started) / scheduled, 0 when nothing was
  // scheduled. Dave's headline figure — a long task half-done is progress, not a
  // miss — while the finished/started split stays visible in the bars and
  // per-category numbers so it can't hide an unfinished pile.
  completionRate: number;
  minutesWorkedByIntegration: WeekIntegrationSummary[];
  totalMinutesWorked: number;
  // Working days spent out of office (yyyy-MM-dd, ascending). A week with days
  // in here is not comparable to a full week: less was possible, so less got
  // done. The rate is left alone — inflating it would be inventing work — and
  // the days are shown alongside it so the number reads correctly.
  outOfOfficeDays: string[];
}

// Working days in a standard week, for reading a week's completion against the
// time actually available. Weeks are Mon–Fri here, matching the app's default
// working days; a week fully out of office has none left.
const WORKING_DAYS_PER_WEEK = 5;

export function workingDaysAvailable(week: Pick<WeekSummary, 'outOfOfficeDays'>): number {
  return Math.max(0, WORKING_DAYS_PER_WEEK - week.outOfOfficeDays.length);
}

const UNCATEGORISED = 'Uncategorised';

export function summariseWeek(record: WeeklyStatsRecord): WeekSummary {
  const byCategory = new Map<string, WeekCategorySummary>();
  const bump = (task: WeeklyTaskOutcome) => {
    const category = task.category || UNCATEGORISED;
    const row =
      byCategory.get(category) ??
      { category, scheduled: 0, completed: 0, started: 0, carried: 0, dropped: 0 };
    row.scheduled += 1; // every recorded task counts toward the high-water mark
    if (task.outcome === 'done') row.completed += 1;
    else if (task.outcome === 'started') row.started += 1;
    // 'unscheduled' (planned, then left without a slot) folds into 'carried':
    // both mean planned-but-not-done-and-still-open, so no progress figure or UI
    // consumer needs to distinguish them.
    else if (task.outcome === 'carried' || task.outcome === 'unscheduled') row.carried += 1;
    else if (task.outcome === 'dropped') row.dropped += 1;
    byCategory.set(category, row);
  };
  for (const task of Object.values(record.tasks ?? {})) bump(task);

  const categories = [...byCategory.values()].sort((a, b) => a.category.localeCompare(b.category));
  const totalScheduled = categories.reduce((n, c) => n + c.scheduled, 0);
  const totalCompleted = categories.reduce((n, c) => n + c.completed, 0);
  const totalStarted = categories.reduce((n, c) => n + c.started, 0);

  const minutesWorkedByIntegration: WeekIntegrationSummary[] = Object.entries(
    record.integrations ?? {}
  )
    .map(([integrationId, entry]) => ({
      integrationId,
      integrationName: entry.integrationName,
      minutes: Object.values(entry.days ?? {}).reduce((n, d) => n + (d.minutesWorked || 0), 0),
    }))
    .sort((a, b) => a.integrationName.localeCompare(b.integrationName));

  return {
    weekStart: record.weekStart,
    categories,
    totalScheduled,
    totalCompleted,
    totalStarted,
    completionRate: totalScheduled > 0 ? (totalCompleted + totalStarted) / totalScheduled : 0,
    minutesWorkedByIntegration,
    totalMinutesWorked: minutesWorkedByIntegration.reduce((n, i) => n + i.minutes, 0),
    outOfOfficeDays: [...(record.outOfOfficeDays ?? [])].sort(),
  };
}

// Per-category progress for the Command Center's weekly-progress card: X done
// out of Y tasks scheduled into the week (Y being the high-water mark).
export interface WeeklyProgressRow {
  category: string;
  scheduledTasks: number; // Y
  completedTasks: number; // finished
  startedTasks: number; // worked on but not finished
}

export function weeklyProgressRows(
  record: WeeklyStatsRecord | null,
  // Config categories, so a planned-but-empty category still shows a 0 / 0 row
  // in the configured order rather than vanishing.
  categories: string[]
): WeeklyProgressRow[] {
  const summary = record ? summariseWeek(record) : null;
  const byCategory = new Map((summary?.categories ?? []).map(c => [c.category, c]));
  const rows: WeeklyProgressRow[] = categories.map(category => ({
    category,
    scheduledTasks: byCategory.get(category)?.scheduled ?? 0,
    completedTasks: byCategory.get(category)?.completed ?? 0,
    startedTasks: byCategory.get(category)?.started ?? 0,
  }));
  // Anything recorded under a category the config no longer lists still shows,
  // after the configured ones — a past week must not lose its history.
  for (const c of summary?.categories ?? []) {
    if (!categories.includes(c.category)) {
      rows.push({
        category: c.category,
        scheduledTasks: c.scheduled,
        completedTasks: c.completed,
        startedTasks: c.started,
      });
    }
  }
  return rows;
}

// --- Left unscheduled -------------------------------------------------------
// Tasks planned into the week that then slid out of the schedule, so they can be
// surfaced on the dashboard rather than silently lost. Two ways that happens,
// both derived from the durable record (no new storage needed):
//  * 'deferred'    — the defer / end-of-week carry paths record 'carried',
//  * 'unscheduled' — the "leave unscheduled" path records 'unscheduled'.
// Deliberately excludes 'dropped': a task the user explicitly deleted was not
// lost, it was abandoned on purpose.
export interface UnscheduledTask {
  taskId: string;
  title?: string;
  category: string;
  // How it left the schedule, so the widget can label it honestly.
  reason: 'deferred' | 'unscheduled';
  // ISO — when it last dropped out of the schedule (its outcome last changed).
  droppedAt?: string;
  // Consecutive weeks it has been carried, when the carry-over marker tracks it.
  // Mid-week deferrals / leave-unscheduled write no marker, so this is often absent.
  carryStreak?: number;
}

export function unscheduledThisWeek(
  record: WeeklyStatsRecord | null,
  carryOvers: Record<string, CarryOverEntry>
): UnscheduledTask[] {
  if (!record) return [];
  const rows: UnscheduledTask[] = Object.values(record.tasks ?? {})
    .filter(t => t.outcome === 'carried' || t.outcome === 'unscheduled')
    .map(t => ({
      taskId: t.taskId,
      ...(t.title ? { title: t.title } : {}),
      category: t.category,
      reason: t.outcome === 'unscheduled' ? ('unscheduled' as const) : ('deferred' as const),
      ...(t.outcomeAt ? { droppedAt: t.outcomeAt } : {}),
      ...(carryOvers[t.taskId]?.carries ? { carryStreak: carryOvers[t.taskId].carries } : {}),
    }));
  // Most-recently dropped first; ties broken by title for a stable order.
  rows.sort(
    (a, b) =>
      (b.droppedAt ?? '').localeCompare(a.droppedAt ?? '') ||
      (a.title ?? '').localeCompare(b.title ?? '')
  );
  return rows;
}

// --- Stacked time bars ------------------------------------------------------
// The Analysis page shows one bar per workspace, segmented by work category.
// Totals stay authoritative (the overlap-deduped minutes the week recorded); the
// segments are the category split. When the split doesn't account for the whole
// total — days recorded before category tracking existed — the remainder shows
// as UNSPLIT_CATEGORY rather than silently shrinking the bar.
export const UNSPLIT_CATEGORY = 'Unsplit';

export interface TimeSegment {
  category: string;
  minutes: number;
  share: number; // 0..1 of the integration's total
}

export interface IntegrationTime {
  integrationId: string;
  integrationName: string;
  totalMinutes: number;
  segments: TimeSegment[]; // largest first, no zero-minute segments
}

export function stackedTime(
  totals: Array<{ integrationId: string; integrationName: string; minutes: number }>,
  categoryMinutes: Array<{ integrationId: string; category: string; minutes: number }>
): IntegrationTime[] {
  const byIntegration = new Map<string, Map<string, number>>();
  for (const row of categoryMinutes) {
    if (row.minutes <= 0) continue;
    const inner = byIntegration.get(row.integrationId) ?? new Map<string, number>();
    inner.set(row.category, (inner.get(row.category) ?? 0) + row.minutes);
    byIntegration.set(row.integrationId, inner);
  }

  return totals.map(total => {
    const inner = byIntegration.get(total.integrationId) ?? new Map<string, number>();
    const categorised = [...inner.values()].reduce((n, m) => n + m, 0);
    const segments: TimeSegment[] = [...inner.entries()].map(([category, minutes]) => ({
      category,
      minutes,
      share: 0,
    }));

    // Anything the categories don't account for is shown, not dropped.
    const remainder = total.minutes - categorised;
    if (remainder > 0.5) segments.push({ category: UNSPLIT_CATEGORY, minutes: remainder, share: 0 });

    const sum = segments.reduce((n, s) => n + s.minutes, 0);
    for (const segment of segments) segment.share = sum > 0 ? segment.minutes / sum : 0;
    segments.sort((a, b) => b.minutes - a.minutes || a.category.localeCompare(b.category));

    return {
      integrationId: total.integrationId,
      integrationName: total.integrationName,
      // The bar's total is what its segments add up to, so the two can never
      // disagree on screen.
      totalMinutes: Math.max(total.minutes, sum),
      segments,
    };
  });
}

// The per-category minutes a week's durable record already knows (written per
// day, per integration by the live recorder and the reconcile).
export function categoryMinutesFromRecord(
  record: WeeklyStatsRecord
): Array<{ integrationId: string; category: string; minutes: number }> {
  const rows: Array<{ integrationId: string; category: string; minutes: number }> = [];
  for (const [integrationId, entry] of Object.entries(record.integrations ?? {})) {
    for (const day of Object.values(entry.days ?? {})) {
      for (const [category, minutes] of Object.entries(day.byCategory ?? {})) {
        rows.push({ integrationId, category, minutes });
      }
    }
  }
  return rows;
}
