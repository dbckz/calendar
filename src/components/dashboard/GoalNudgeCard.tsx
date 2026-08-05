'use client';

import { AlertTriangle, Target } from 'lucide-react';

import { periodLabel } from '@/lib/goal-periods';
import { sectionLabel } from '@/lib/life-sections';
import type { GoalNudge } from '@/lib/goal-progress';

const REASON_TEXT: Record<GoalNudge['reason'], string> = {
  stalled: 'You marked this stalled',
  'no-evidence': 'Nothing recorded yet this period',
  behind: 'Behind the pace needed',
};

interface GoalNudgeCardProps {
  nudges: GoalNudge[];
  // Jumps to the Goals section so a nudge can be acted on rather than just read.
  onOpenGoals: () => void;
}

// Surfaces goals that are past halfway through their period with nothing to
// show. Renders nothing when there is nothing to flag — a card that is always
// on screen stops being read.
export function GoalNudgeCard({ nudges, onOpenGoals }: GoalNudgeCardProps) {
  if (nudges.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="flex items-center gap-2 font-semibold text-amber-900">
          <AlertTriangle className="w-4 h-4" />
          {nudges.length} goal{nudges.length === 1 ? '' : 's'} need attention
        </h3>
        <button
          onClick={onOpenGoals}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-amber-900 bg-white/70 border border-amber-300 rounded-md hover:bg-white"
        >
          <Target className="w-3.5 h-3.5" />
          Open goals
        </button>
      </div>

      <ul className="space-y-1.5">
        {nudges.slice(0, 5).map(nudge => (
          <li key={nudge.goal.id} className="text-sm">
            <span className="font-medium text-amber-900">{nudge.goal.title}</span>
            <span className="text-amber-800/80">
              {' '}
              — {REASON_TEXT[nudge.reason]} ({Math.round(nudge.progress.periodElapsed * 100)}% through{' '}
              {periodLabel(nudge.goal.periodKind, nudge.goal.periodKey)}, {sectionLabel(nudge.goal.sectionId)})
            </span>
          </li>
        ))}
      </ul>

      {nudges.length > 5 && (
        <p className="mt-2 text-xs text-amber-800/80">
          and {nudges.length - 5} more in the Goals section.
        </p>
      )}
    </div>
  );
}
