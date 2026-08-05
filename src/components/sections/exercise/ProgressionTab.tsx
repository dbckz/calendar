'use client';

import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import { api } from '@/lib/api';
import type { ExerciseProgression } from '@/lib/exercise-progression';

// Per-lift history. The point of logging sets and weights rather than just
// "went to the gym": whether a given exercise is actually going up.
export function ProgressionTab() {
  const [progressions, setProgressions] = useState<ExerciseProgression[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getExerciseProgressions()
      .then(res => !cancelled && setProgressions(res.progressions))
      .catch(err => console.error('Failed to load exercise progressions:', err))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return <p className="max-w-3xl mx-auto p-6 text-sm text-gray-500">Loading…</p>;
  }

  if (progressions.length === 0) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <p className="text-sm text-gray-500">
          No exercises logged yet. Progression appears once sessions have exercises recorded
          against them.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <p className="mb-4 text-sm text-gray-500">
        Every exercise you&apos;ve logged, most-trained first. Tap one to see its history.
      </p>

      <div className="space-y-2">
        {progressions.map(progression => {
          const isOpen = expanded === progression.key;
          return (
            <div key={progression.key} className="rounded-lg border border-gray-200 bg-white">
              <button
                onClick={() => setExpanded(isOpen ? null : progression.key)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-3 p-3 text-left"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{progression.name}</p>
                  <p className="text-xs text-gray-500">
                    {progression.sessions} session{progression.sessions === 1 ? '' : 's'}
                    {progression.latest?.weightKg !== undefined &&
                      ` · latest ${progression.latest.weightKg}kg`}
                  </p>
                </div>
                <ChangeBadge changeKg={progression.weightChangeKg} />
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 px-3 pb-3">
                  <table className="w-full text-sm">
                    <thead className="text-left text-[11px] uppercase tracking-wide text-gray-400">
                      <tr>
                        <th className="py-2 font-semibold">Date</th>
                        <th className="py-2 font-semibold">Sets</th>
                        <th className="py-2 font-semibold">Weight</th>
                        <th className="py-2 font-semibold">Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {progression.points.map((point, i) => (
                        <tr key={`${point.date}-${i}`}>
                          <td className="py-2 text-gray-600 tabular-nums">
                            {format(parseISO(point.date), 'd MMM')}
                          </td>
                          <td className="py-2 text-gray-600 tabular-nums">
                            {point.sets && point.reps
                              ? `${point.sets} × ${point.reps}`
                              : point.sets && point.holdSeconds
                                ? `${point.sets} × ${point.holdSeconds}s`
                                : '—'}
                          </td>
                          <td className="py-2 text-gray-600 tabular-nums">
                            {point.weightKg !== undefined ? `${point.weightKg}kg` : '—'}
                          </td>
                          <td className="py-2 text-xs text-gray-500">{point.notes ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Change in top weight since the first loaded session. Silent for bodyweight
// work, where there is no weight to have changed.
function ChangeBadge({ changeKg }: { changeKg?: number }) {
  if (changeKg === undefined) return <span className="text-xs text-gray-400">—</span>;

  if (changeKg === 0) {
    return (
      <span className="flex flex-shrink-0 items-center gap-1 text-xs font-semibold text-gray-500">
        <Minus className="h-3.5 w-3.5" />
        level
      </span>
    );
  }

  const up = changeKg > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`flex flex-shrink-0 items-center gap-1 text-xs font-semibold ${
        up ? 'text-emerald-700' : 'text-amber-700'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {up ? '+' : ''}
      {changeKg}kg
    </span>
  );
}
