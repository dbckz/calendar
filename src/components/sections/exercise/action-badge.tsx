import { ArrowUp, Equal, TrendingDown, Sparkles, type LucideIcon } from 'lucide-react';

import type { TargetAction } from '@/lib/exercise-targets';

// How each progression recommendation is labelled and coloured. Shared by the
// Plan tab's read-only targets and the Today checklist so a "Go up" looks the
// same wherever it appears. Deliberately tiny and self-contained — the mobile
// checklist imports it without pulling in a desktop section.
const ACTION_STYLE: Record<TargetAction, { label: string; className: string; Icon: LucideIcon }> = {
  increase: { label: 'Go up', className: 'text-emerald-700 bg-emerald-50', Icon: ArrowUp },
  'add-reps': { label: 'Add reps', className: 'text-emerald-700 bg-emerald-50', Icon: ArrowUp },
  hold: { label: 'Repeat', className: 'text-blue-700 bg-blue-50', Icon: Equal },
  reduce: { label: 'Ease off', className: 'text-amber-700 bg-amber-50', Icon: TrendingDown },
  'no-history': { label: 'New', className: 'text-gray-600 bg-gray-100', Icon: Sparkles },
};

export function ActionBadge({ action }: { action: TargetAction }) {
  const style = ACTION_STYLE[action];
  const Icon = style.Icon;
  return (
    <span
      className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${style.className}`}
    >
      <Icon className="h-3 w-3" />
      {style.label}
    </span>
  );
}
