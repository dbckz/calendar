'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Target } from 'lucide-react';

import { api } from '@/lib/api';
import { periodKeyFor } from '@/lib/goal-periods';
import { sectionLabel } from '@/lib/life-sections';
import type { GoalCheckInStatus, GoalWithProgress } from '@/types/life';
import { GoalPacingBar } from './GoalPacingBar';

type PanelMode = 'check-in' | 'alignment';

const STATUS_BUTTONS: Array<{ status: GoalCheckInStatus; label: string; className: string }> = [
  { status: 'on-track', label: 'On track', className: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' },
  { status: 'slipping', label: 'Slipping', className: 'bg-amber-100 text-amber-800 hover:bg-amber-200' },
  { status: 'stalled', label: 'Stalled', className: 'bg-red-100 text-red-800 hover:bg-red-200' },
];

interface GoalCheckInPanelProps {
  // 'check-in'  — the end-of-week review: one-line status per goal.
  // 'alignment' — the plan-my-week wizard: which goals does this week serve?
  mode: PanelMode;
}

// Embedded in the existing weekly rituals rather than living only in the Goals
// section, because a goal nobody looks at between planning sessions is a goal
// that quietly dies. Each answer saves on click, so the panel never has to be
// threaded into the host wizard's apply payload.
export function GoalCheckInPanel({ mode }: GoalCheckInPanelProps) {
  const [items, setItems] = useState<GoalWithProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saved, setSaved] = useState<Record<string, GoalCheckInStatus>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const now = new Date();
      const [months, quarters] = await Promise.all([
        api.getGoals({
          periodKind: 'month',
          periodKey: periodKeyFor('month', now),
          status: 'active',
          withProgress: true,
        }),
        api.getGoals({
          periodKind: 'quarter',
          periodKey: periodKeyFor('quarter', now),
          status: 'active',
          withProgress: true,
        }),
      ]);
      setItems([...(months.items ?? []), ...(quarters.items ?? [])]);
    } catch (err) {
      console.error('Failed to load goals for the check-in panel:', err);
      setError('Could not load goals.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const record = async (goalId: string, status: GoalCheckInStatus, note?: string) => {
    // Optimistic: the panel is a side-quest inside a bigger flow, so a slow
    // round trip must not make it feel stuck.
    setSaved(prev => ({ ...prev, [goalId]: status }));
    try {
      await api.checkInGoal(goalId, { status, note, source: 'weekly-review' });
    } catch (err) {
      console.error('Failed to record goal check-in:', err);
      setSaved(prev => {
        const next = { ...prev };
        delete next[goalId];
        return next;
      });
      setError('Could not save that check-in.');
    }
  };

  if (isLoading) return null;
  if (items.length === 0) return null;

  const unserved = mode === 'alignment' ? items.filter(i => !saved[i.goal.id]) : [];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="flex items-center gap-2 font-semibold text-gray-900 mb-1">
        <Target className="w-4 h-4 text-gray-500" />
        {mode === 'check-in' ? 'Where are your goals?' : 'What does this week serve?'}
      </h3>
      <p className="text-sm text-gray-500 mb-3">
        {mode === 'check-in'
          ? 'One line per goal. This is what stops a month drifting past unnoticed.'
          : 'Mark the goals this week actually books time against. Anything left unmarked is a goal getting no time.'}
      </p>

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      <div className="space-y-3">
        {items.map(({ goal, progress }) => (
          <div key={goal.id} className="rounded-md border border-gray-200 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-gray-900">{goal.title}</p>
                <p className="text-[11px] text-gray-500">
                  {sectionLabel(goal.sectionId)} ·{' '}
                  {goal.periodKind === 'month' ? 'this month' : 'this quarter'}
                </p>
              </div>
              {saved[goal.id] && (
                <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700 shrink-0">
                  <Check className="w-3.5 h-3.5" />
                  {mode === 'alignment' ? 'Serving' : saved[goal.id]}
                </span>
              )}
            </div>

            <div className="mt-2">
              <GoalPacingBar progress={progress} target={goal.target} />
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {mode === 'alignment' ? (
                <button
                  onClick={() => record(goal.id, 'on-track', 'Time booked in this week’s plan')}
                  disabled={!!saved[goal.id]}
                  className="px-2.5 py-1 text-xs font-semibold rounded-md bg-blue-100 text-blue-800 hover:bg-blue-200 disabled:opacity-50"
                >
                  This week serves it
                </button>
              ) : (
                STATUS_BUTTONS.map(button => (
                  <button
                    key={button.status}
                    onClick={() => record(goal.id, button.status)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md ${button.className} ${
                      saved[goal.id] === button.status ? 'ring-2 ring-offset-1 ring-gray-400' : ''
                    }`}
                  >
                    {button.label}
                  </button>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {mode === 'alignment' && unserved.length > 0 && (
        <p className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
          {unserved.length} goal{unserved.length === 1 ? '' : 's'} get no time this week:{' '}
          {unserved.map(i => i.goal.title).join(', ')}. That may be the right call — but make it a
          decision rather than an oversight.
        </p>
      )}
    </div>
  );
}
