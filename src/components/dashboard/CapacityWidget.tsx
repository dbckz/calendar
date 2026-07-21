'use client';

import type { CapacityRow } from '@/lib/capacity';

interface CapacityWidgetProps {
  rows: CapacityRow[];
  isLoading?: boolean;
}

function barColor(ratio: number): string {
  if (ratio >= 1) return 'bg-emerald-500';
  if (ratio >= 0.5) return 'bg-amber-500';
  return 'bg-orange-400';
}

// Progress ratio for a row's bar. Quota'd rows use scheduled/target (capped at
// 100% by the caller). No-quota rows (e.g. General Todos) have no target to
// progress toward, so any scheduled work reads as "on track" — full green bar —
// rather than the low-ratio orange a 0-target division would otherwise imply.
function barRatio(scheduledCount: number, target: number): number {
  if (target > 0) return scheduledCount / target;
  return scheduledCount > 0 ? 1 : 0;
}

export function CapacityWidget({ rows, isLoading }: CapacityWidgetProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h2 className="text-base font-semibold text-gray-900">Weekly Capacity</h2>
      <p className="text-[11px] text-gray-400 mb-2.5">Only app-scheduled blocks count toward these totals.</p>

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No quotas configured.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map(row => {
            const target = row.weeklyCount || 0;
            const ratio = barRatio(row.scheduledCount, target);
            const pct = Math.min(100, Math.round(ratio * 100));
            return (
              <li key={row.category}>
                <div className="flex items-center justify-between text-[13px] mb-0.5">
                  <span className="font-medium text-gray-800">{row.category}</span>
                  <span className="text-gray-500">
                    {row.scheduledCount}
                    {target > 0 ? ` / ${target}` : ''}
                    {row.completedCount > 0 && (
                      <span className="text-emerald-600"> ({row.completedCount} done)</span>
                    )}
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
