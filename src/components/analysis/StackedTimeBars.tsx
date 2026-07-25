'use client';

import { categoryColour, formatMinutes, pct } from './format';
import type { WeekSummary } from './types';
import type { DrilldownTarget } from './TimeDrilldownModal';

// One stacked bar per workspace: segments sized by their share of that
// workspace's deduped total, each one a button into the events behind it.
export function StackedTimeBars({
  week,
  onSelect,
}: {
  week: WeekSummary;
  onSelect: (target: DrilldownTarget) => void;
}) {
  const integrations = week.timeByIntegration ?? [];
  const hasAnyTime = integrations.some(entry => entry.totalMinutes > 0);
  if (!hasAnyTime) return null;

  return (
    <div className="mt-4 pt-3 border-t border-gray-100">
      <div className="flex items-baseline justify-between text-[13px] mb-2">
        <span className="font-medium text-gray-800">Time worked</span>
        <span className="text-gray-500">{formatMinutes(week.totalMinutesWorked)} total</span>
      </div>

      <ul className="space-y-2.5">
        {integrations.map(entry => (
          <li key={entry.integrationId}>
            <div className="flex items-center justify-between text-[13px] mb-1">
              <span className="text-gray-700">{entry.integrationName}</span>
              <span className="text-gray-500">{formatMinutes(entry.totalMinutes)}</span>
            </div>

            {entry.totalMinutes === 0 || entry.segments.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No time recorded.</p>
            ) : (
              <div className="flex h-3 w-full rounded-full bg-gray-100">
                {entry.segments.map(segment => (
                  <button
                    key={segment.category}
                    type="button"
                    onClick={() =>
                      onSelect({
                        weekStart: week.weekStart,
                        integrationId: entry.integrationId,
                        integrationName: entry.integrationName,
                        category: segment.category,
                        minutes: segment.minutes,
                        events: (week.events ?? []).filter(
                          e =>
                            e.integrationId === entry.integrationId &&
                            e.category === segment.category
                        ),
                      })
                    }
                    style={{
                      width: `${(segment.share * 100).toFixed(1)}%`,
                      backgroundColor: categoryColour(segment.category),
                    }}
                    title={`${segment.category} — ${formatMinutes(segment.minutes)} (${pct(segment.share)}%)`}
                    aria-label={`${entry.integrationName}, ${segment.category}: ${formatMinutes(segment.minutes)}, ${pct(segment.share)} per cent`}
                    className="group relative h-full first:rounded-l-full last:rounded-r-full transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-gray-400"
                  >
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] font-medium text-white group-hover:block group-focus-visible:block">
                      {segment.category} · {formatMinutes(segment.minutes)} · {pct(segment.share)}%
                    </span>
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default StackedTimeBars;
