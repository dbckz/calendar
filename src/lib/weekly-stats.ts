// Pure summarisation over a week's durable stats record.
//
// Per-category totals are DERIVED here rather than stored, so the counters can
// never drift from the underlying task list. Only outcome 'done' counts as
// completed: a task carried into next week or dropped stays in the denominator,
// which is exactly what makes over-scheduling visible after the fact.

import type { WeeklyStatsRecord, WeeklyTaskOutcome } from '@/types';

export interface WeekCategorySummary {
  category: string;
  scheduled: number;
  completed: number;
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
  completionRate: number; // 0..1; 0 when nothing was scheduled
  minutesWorkedByIntegration: WeekIntegrationSummary[];
  totalMinutesWorked: number;
}

const UNCATEGORISED = 'Uncategorised';

export function summariseWeek(record: WeeklyStatsRecord): WeekSummary {
  const byCategory = new Map<string, WeekCategorySummary>();
  const bump = (task: WeeklyTaskOutcome) => {
    const category = task.category || UNCATEGORISED;
    const row =
      byCategory.get(category) ??
      { category, scheduled: 0, completed: 0, carried: 0, dropped: 0 };
    row.scheduled += 1; // every recorded task counts toward the high-water mark
    if (task.outcome === 'done') row.completed += 1;
    else if (task.outcome === 'carried') row.carried += 1;
    else if (task.outcome === 'dropped') row.dropped += 1;
    byCategory.set(category, row);
  };
  for (const task of Object.values(record.tasks ?? {})) bump(task);

  const categories = [...byCategory.values()].sort((a, b) => a.category.localeCompare(b.category));
  const totalScheduled = categories.reduce((n, c) => n + c.scheduled, 0);
  const totalCompleted = categories.reduce((n, c) => n + c.completed, 0);

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
    completionRate: totalScheduled > 0 ? totalCompleted / totalScheduled : 0,
    minutesWorkedByIntegration,
    totalMinutesWorked: minutesWorkedByIntegration.reduce((n, i) => n + i.minutes, 0),
  };
}

// Per-category progress for the Command Center's weekly-progress card: X done
// out of Y tasks scheduled into the week (Y being the high-water mark).
export interface WeeklyProgressRow {
  category: string;
  scheduledTasks: number; // Y
  completedTasks: number; // X
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
  }));
  // Anything recorded under a category the config no longer lists still shows,
  // after the configured ones — a past week must not lose its history.
  for (const c of summary?.categories ?? []) {
    if (!categories.includes(c.category)) {
      rows.push({ category: c.category, scheduledTasks: c.scheduled, completedTasks: c.completed });
    }
  }
  return rows;
}
