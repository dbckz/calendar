'use client';

import { format, parseISO } from 'date-fns';
import { FlaskConical, HeartPulse } from 'lucide-react';

import type { Experiment, WellbeingAnalysis } from '@/types/wellbeing';

// Read-only, like the rest of the phone view. The habits are answered in the
// daily review and the experiments are set up on the desktop; this is the
// glance at how both are going.
export function WellbeingTab({
  analysis,
  experiments,
  isLoading,
  error,
}: {
  analysis: WellbeingAnalysis | null;
  experiments: Experiment[];
  isLoading: boolean;
  error: string | null;
}) {
  if (isLoading) {
    return <p className="py-10 text-center text-sm text-gray-500">Loading…</p>;
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </div>
    );
  }

  const active = experiments.filter(e => e.status === 'running' || e.status === 'planned');

  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Habits</h2>
        {!analysis || analysis.daysLogged === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-8 text-center">
            <HeartPulse className="mx-auto h-8 w-8 text-gray-400" />
            <p className="mt-3 text-sm font-medium text-gray-700">Nothing logged yet</p>
            <p className="mt-1 text-xs text-gray-500">
              The habit questions are asked at the end of the daily review.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {analysis.habits.map(habit => (
              <div
                key={habit.habitId}
                className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900">{habit.label}</p>
                  <span className="text-sm tabular-nums text-gray-600">
                    {habit.rate === null ? '—' : `${Math.round(habit.rate * 100)}%`}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${(habit.rate ?? 0) * 100}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-gray-500">
                  {habit.currentStreak > 0
                    ? `${habit.currentStreak}-day streak`
                    : 'No current streak'}
                  {' · '}
                  {habit.daysDone}/{habit.daysLogged} logged days
                  {habit.reasons[0] ? ` · usually: ${habit.reasons[0].reason}` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Experiments
        </h2>
        {active.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-8 text-center">
            <FlaskConical className="mx-auto h-8 w-8 text-gray-400" />
            <p className="mt-3 text-sm font-medium text-gray-700">Nothing running</p>
            <p className="mt-1 text-xs text-gray-500">
              Set one up on the desktop portal, under Wellbeing.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {active.map(experiment => (
              <div
                key={experiment.id}
                className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-sm font-medium text-gray-900">{experiment.title}</p>
                  <span
                    className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      experiment.status === 'running'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {experiment.status === 'running' ? 'Running' : 'Planned'}
                  </span>
                </div>
                {experiment.protocol && (
                  <p className="mt-1 text-xs text-gray-600">{experiment.protocol}</p>
                )}
                <p className="mt-1.5 text-[11px] text-gray-400">
                  {experiment.endDate
                    ? `Until ${format(parseISO(experiment.endDate), 'd MMM')}`
                    : 'No end date'}
                  {experiment.checkIns.length > 0 &&
                    ` · ${experiment.checkIns.length} check-in${
                      experiment.checkIns.length === 1 ? '' : 's'
                    }`}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
