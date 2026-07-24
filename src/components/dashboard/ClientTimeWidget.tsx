'use client';

interface Integration {
  id: string;
  name: string;
}

interface ClientTimeWidgetProps {
  // Minutes worked SO FAR today (the elapsed part of each attributed block),
  // keyed by Asana integration id.
  timeWorkedByIntegration: Record<string, number>;
  // Minutes SCHEDULED today (the full length of each attributed block), keyed
  // the same way. The bar fills as the day is worked through.
  timeScheduledByIntegration?: Record<string, number>;
  integrations: Integration[];
}

export function formatDuration(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded}m`;
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

// Time worked today per client. EVERY integration gets a bar, including one with
// nothing on it today — a zero is information ("no OM time today"), not an empty
// space, and a missing row reads as a bug.
export function ClientTimeWidget({
  timeWorkedByIntegration,
  timeScheduledByIntegration,
  integrations,
}: ClientTimeWidgetProps) {
  const rows = integrations.map(i => ({
    ...i,
    worked: timeWorkedByIntegration[i.id] || 0,
    scheduled: timeScheduledByIntegration?.[i.id] || 0,
  }));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h2 className="text-base font-semibold text-gray-900 mb-2">Time Worked Today</h2>
      {rows.length === 0 ? (
        <p className="text-[13px] text-gray-400 italic">No Asana workspaces connected.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map(row => {
            const pct =
              row.scheduled > 0 ? Math.min(100, Math.round((row.worked / row.scheduled) * 100)) : 0;
            return (
              <li key={row.id}>
                <div className="flex items-center justify-between text-[13px] mb-0.5">
                  <span className="font-medium text-gray-800">{row.name}</span>
                  <span className="text-gray-600">
                    {formatDuration(row.worked)}
                    <span className="text-gray-400">
                      {' '}
                      / {row.scheduled > 0 ? formatDuration(row.scheduled) : 'nothing scheduled'}
                    </span>
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
