'use client';

import { AlertTriangle, Target } from 'lucide-react';

import { GoalPacingBar } from '@/components/goals/GoalPacingBar';
import { periodKeyFor, periodLabel } from '@/lib/goal-periods';
import { sectionLabel } from '@/lib/life-sections';
import type { GoalNudge } from '@/lib/goal-progress';
import type { GoalWithProgress } from '@/types/life';

// Read-only, like the rest of the phone view: goals and their pacing can be
// checked here, but setting, editing and checking in stay on the desktop where
// the reflection and planning sessions live.
export function GoalsTab({
  monthItems,
  quarterItems,
  nudges,
  isLoading,
  error,
}: {
  monthItems: GoalWithProgress[];
  quarterItems: GoalWithProgress[];
  nudges: GoalNudge[];
  isLoading: boolean;
  error: string | null;
}) {
  const now = new Date();

  if (isLoading) {
    return <p className="py-10 text-center text-sm text-gray-500">Loading goals…</p>;
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (monthItems.length === 0 && quarterItems.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-10 text-center">
        <Target className="mx-auto h-8 w-8 text-gray-400" />
        <p className="mt-3 text-sm font-medium text-gray-700">No goals set</p>
        <p className="mt-1 text-xs text-gray-500">
          Set them on the desktop portal, in the Goals section.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {nudges.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            {nudges.length} need{nudges.length === 1 ? 's' : ''} attention
          </h2>
          <ul className="mt-1.5 space-y-1">
            {nudges.slice(0, 4).map(nudge => (
              <li key={nudge.goal.id} className="text-xs text-amber-800">
                <span className="font-medium">{nudge.goal.title}</span> —{' '}
                {nudge.reason === 'stalled'
                  ? 'marked stalled'
                  : nudge.reason === 'no-evidence'
                    ? 'nothing recorded yet'
                    : 'behind pace'}
              </li>
            ))}
          </ul>
        </div>
      )}

      <GoalGroup
        heading={periodLabel('month', periodKeyFor('month', now))}
        items={monthItems}
      />
      <GoalGroup
        heading={periodLabel('quarter', periodKeyFor('quarter', now))}
        items={quarterItems}
      />
    </div>
  );
}

function GoalGroup({ heading, items }: { heading: string; items: GoalWithProgress[] }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{heading}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400">Nothing set.</p>
      ) : (
        <div className="space-y-2">
          {items.map(({ goal, progress }) => (
            <div key={goal.id} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-sm font-medium text-gray-900">{goal.title}</p>
                <span className="flex-shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                  {sectionLabel(goal.sectionId)}
                </span>
              </div>
              <div className="mt-2">
                <GoalPacingBar progress={progress} target={goal.target} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
