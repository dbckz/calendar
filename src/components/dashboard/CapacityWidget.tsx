'use client';

import type { WeeklyProgressRow } from '@/lib/weekly-stats';

interface CapacityWidgetProps {
  rows: WeeklyProgressRow[];
  // False before the week has been planned — nothing has been scheduled into it
  // yet, so there is no progress to show.
  planned?: boolean;
  isLoading?: boolean;
}

function barColor(ratio: number): string {
  if (ratio >= 1) return 'bg-emerald-500';
  if (ratio >= 0.5) return 'bg-amber-500';
  return 'bg-orange-400';
}

// Weekly PROGRESS: how many of the tasks scheduled into this week are done.
// The denominator is the high-water mark of tasks scheduled into the week, so a
// task carried out or dropped stays in it and counts as not done — that is what
// makes over-scheduling visible at the end of the week.
export function CapacityWidget({ rows, planned = true, isLoading }: CapacityWidgetProps) {
  const withWork = rows.filter(r => r.scheduledTasks > 0);
  const totalScheduled = withWork.reduce((n, r) => n + r.scheduledTasks, 0);
  const totalCompleted = withWork.reduce((n, r) => n + r.completedTasks, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-900">Weekly progress</h2>
        {!isLoading && planned && totalScheduled > 0 && (
          <span className="text-[13px] text-gray-500">
            {totalCompleted} / {totalScheduled} tasks
          </span>
        )}
      </div>
      <p className="text-[11px] text-gray-400 mb-2.5">
        Tasks completed out of those scheduled into this week.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No quotas configured.</p>
      ) : !planned || totalScheduled === 0 ? (
        <p className="text-sm text-gray-400 italic">
          This week isn&apos;t planned yet — progress appears once tasks are scheduled.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {withWork.map(row => {
            const ratio = row.scheduledTasks > 0 ? row.completedTasks / row.scheduledTasks : 0;
            const pct = Math.min(100, Math.round(ratio * 100));
            return (
              <li key={row.category}>
                <div className="flex items-center justify-between text-[13px] mb-0.5">
                  <span className="font-medium text-gray-800">{row.category}</span>
                  <span className="text-gray-500">
                    {row.completedTasks} / {row.scheduledTasks}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColor(ratio)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
