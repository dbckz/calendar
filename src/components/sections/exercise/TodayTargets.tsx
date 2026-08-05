'use client';

import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ArrowUp, Equal, TrendingDown, Sparkles } from 'lucide-react';

import { api } from '@/lib/api';
import type { ExerciseTarget, TargetAction } from '@/lib/exercise-targets';

const ACTION_STYLE: Record<TargetAction, { label: string; className: string; Icon: typeof ArrowUp }> = {
  increase: { label: 'Go up', className: 'text-emerald-700 bg-emerald-50', Icon: ArrowUp },
  'add-reps': { label: 'Add reps', className: 'text-emerald-700 bg-emerald-50', Icon: ArrowUp },
  hold: { label: 'Repeat', className: 'text-blue-700 bg-blue-50', Icon: Equal },
  reduce: { label: 'Ease off', className: 'text-amber-700 bg-amber-50', Icon: TrendingDown },
  'no-history': { label: 'New', className: 'text-gray-600 bg-gray-100', Icon: Sparkles },
};

// What to aim for today, from the last time each exercise was trained.
//
// Every row shows its reasoning and what was actually done last time, because
// the recommendation is a heuristic over the log — it should be easy to
// disagree with, not something to follow blindly.
export function TodayTargets({ date }: { date?: string }) {
  const [targets, setTargets] = useState<ExerciseTarget[]>([]);
  const [plan, setPlan] = useState<{ label?: string; components: string[] } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .getExerciseTargets(date)
      .then(res => {
        if (cancelled) return;
        setTargets(res.targets);
        setPlan(res.plan ?? null);
      })
      .catch(err => console.error('Failed to load exercise targets:', err))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date]);

  if (isLoading || targets.length === 0) return null;

  return (
    <section className="mb-5 rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-gray-900">
          Aim for {date ? format(parseISO(date), 'EEE d MMM') : 'today'}
        </h3>
        {plan && (
          <span className="text-xs text-gray-500">
            Plan: {plan.label || plan.components.join(' + ')}
          </span>
        )}
      </div>
      <p className="mb-3 text-xs text-gray-500">
        Double progression: hit the reps with something left over, then the weight goes up. Based on
        your last session and the note you wrote about it.
      </p>

      <ul className="divide-y divide-gray-100">
        {targets.map(target => {
          const style = ACTION_STYLE[target.action];
          const Icon = style.Icon;
          return (
            <li key={target.key} className="py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{target.name}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{target.rationale}</p>
                  {target.last && (
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      Last: {format(parseISO(target.last.date), 'd MMM')}
                      {target.last.sets && target.last.reps
                        ? ` · ${target.last.sets}×${target.last.reps}`
                        : ''}
                      {target.last.weightKg !== undefined ? ` · ${target.last.weightKg}kg` : ''}
                    </p>
                  )}
                </div>

                <div className="flex flex-shrink-0 flex-col items-end gap-1">
                  <span
                    className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${style.className}`}
                  >
                    <Icon className="h-3 w-3" />
                    {style.label}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-gray-900">
                    {describeTarget(target)}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function describeTarget(target: ExerciseTarget): string {
  const volume = target.sets && target.reps
    ? `${target.sets} × ${target.reps}`
    : target.sets && target.holdSeconds
      ? `${target.sets} × ${target.holdSeconds}s`
      : '';
  const load = target.weightKg !== undefined ? `${target.weightKg}kg` : '';
  return [volume, load].filter(Boolean).join(' · ') || '—';
}
