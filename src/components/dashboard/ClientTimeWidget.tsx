'use client';

interface Integration {
  id: string;
  name: string;
}

interface ClientTimeWidgetProps {
  // Minutes worked today, keyed by Asana integration id.
  timeWorkedByIntegration: Record<string, number>;
  integrations: Integration[];
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

export function ClientTimeWidget({ timeWorkedByIntegration, integrations }: ClientTimeWidgetProps) {
  const rows = integrations
    .map(i => ({ ...i, minutes: timeWorkedByIntegration[i.id] || 0 }))
    .filter(r => r.minutes > 0);

  const total = rows.reduce((sum, r) => sum + r.minutes, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h2 className="text-base font-semibold text-gray-900 mb-2">Time Worked Today</h2>
      {rows.length === 0 ? (
        <p className="text-[13px] text-gray-400 italic">No tracked time yet today.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map(row => (
            <li key={row.id}>
              <div className="flex items-center justify-between text-[13px] mb-0.5">
                <span className="font-medium text-gray-800">{row.name}</span>
                <span className="text-gray-600">{formatDuration(row.minutes)}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${total > 0 ? Math.round((row.minutes / total) * 100) : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
