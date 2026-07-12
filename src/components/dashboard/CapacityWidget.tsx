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

export function CapacityWidget({ rows, isLoading }: CapacityWidgetProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Weekly Capacity</h2>
      <p className="text-xs text-gray-400 mb-4">Only app-scheduled blocks count toward these totals.</p>

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No quotas configured.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map(row => {
            const target = row.weeklyCount || 0;
            const ratio = target > 0 ? row.scheduledCount / target : 0;
            const pct = Math.min(100, Math.round(ratio * 100));
            return (
              <li key={row.category}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium text-gray-800">{row.category}</span>
                  <span className="text-gray-500">
                    {row.scheduledCount}
                    {target > 0 ? ` / ${target}` : ''}
                    {row.completedCount > 0 && (
                      <span className="text-emerald-600"> ({row.completedCount} done)</span>
                    )}
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColor(ratio)}`}
                    style={{ width: `${target > 0 ? pct : row.scheduledCount > 0 ? 100 : 0}%` }}
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
