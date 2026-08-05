'use client';

import type { GoalProgress, GoalTarget } from '@/types/life';

const PACE_STYLES = {
  ahead: { bar: 'bg-emerald-500', text: 'text-emerald-700', label: 'Ahead' },
  'on-track': { bar: 'bg-blue-500', text: 'text-blue-700', label: 'On track' },
  behind: { bar: 'bg-amber-500', text: 'text-amber-700', label: 'Behind' },
  'no-target': { bar: 'bg-gray-300', text: 'text-gray-500', label: 'No target' },
  'no-data': { bar: 'bg-gray-300', text: 'text-gray-500', label: 'No data' },
} as const;

interface GoalPacingBarProps {
  progress: GoalProgress;
  target?: GoalTarget;
}

// Actual against a straight-line expectation for how far through the period we
// are. The tick is where the goal *should* be today; the fill is where it is.
// Without a target there is nothing to pace against, so only the period's own
// elapsed fraction is shown.
export function GoalPacingBar({ progress, target }: GoalPacingBarProps) {
  const style = PACE_STYLES[progress.pace];
  const unit = target?.unit ? ` ${target.unit}` : '';
  const fill = Math.min(1, Math.max(0, progress.completion ?? 0));
  const tick = Math.min(1, Math.max(0, progress.periodElapsed));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className={`text-xs font-semibold ${style.text}`}>{style.label}</span>
        {target ? (
          <span className="text-xs text-gray-500 tabular-nums">
            {progress.actual ?? 0} / {target.value}
            {unit}
            {progress.expected !== null && (
              <span className="text-gray-400"> · expected {progress.expected}</span>
            )}
          </span>
        ) : (
          <span className="text-xs text-gray-400">
            {Math.round(progress.periodElapsed * 100)}% through the period
          </span>
        )}
      </div>

      <div
        className="relative h-2 rounded-full bg-gray-200 overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(fill * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={target ? `Progress toward ${target.value}${unit}` : 'Period elapsed'}
      >
        <div
          className={`h-full rounded-full transition-[width] ${target ? style.bar : 'bg-gray-400'}`}
          style={{ width: `${(target ? fill : tick) * 100}%` }}
        />
        {target && (
          // The pacing tick. Nudged left by its own width at the far end so it
          // stays visible when the period is nearly over.
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-gray-700/70"
            style={{ left: `calc(${tick * 100}% - ${tick > 0.98 ? 2 : 0}px)` }}
            aria-hidden="true"
          />
        )}
      </div>

      <p className="mt-1 text-[11px] text-gray-400 truncate" title={progress.evidenceLabel}>
        {progress.evidenceLabel}
      </p>
    </div>
  );
}
