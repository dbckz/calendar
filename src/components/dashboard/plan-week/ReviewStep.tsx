'use client';

import { Check, AlertTriangle, ChevronLeft, Flag, Moon } from 'lucide-react';
import { format, parseISO } from 'date-fns';

import type {
  QuotaSummaryRow,
  ConfirmWeekResult,
  WeekCandidateCategory,
  SpareCapacity,
} from '@/lib/api';
import { categoryColor, timeRange, roughDuration } from './helpers';
import type { EditableProposal } from './types';

interface ReviewStepProps {
  proposals: EditableProposal[];
  grouped: Array<{ date: string; items: EditableProposal[] }>;
  overflowProposals: EditableProposal[];
  mustDoIds: Set<string>;
  taskCats: WeekCandidateCategory[] | null;
  exerciseMissingDays: string[];
  quotaSummary: QuotaSummaryRow[];
  results: Record<string, ConfirmWeekResult>;
  hasResults: boolean;
  spareCapacity: SpareCapacity | null;
  toggleAccept: (id: string) => void;
  editStart: (id: string, start: string) => void;
  addMoreTasks: () => void;
}

export function ReviewStep({
  proposals,
  grouped,
  overflowProposals,
  mustDoIds,
  taskCats,
  exerciseMissingDays,
  quotaSummary,
  results,
  hasResults,
  spareCapacity,
  toggleAccept,
  editStart,
  addMoreTasks,
}: ReviewStepProps) {
  if (proposals.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic py-8 text-center">
        Nothing to schedule — quotas are already met or no free time is available this week.
      </p>
    );
  }
  // Which must-do tasks made it into the plan, and which didn't (for a warning).
  // A must-do that fit only in the optional evening overflow gets a softer,
  // actionable notice ("tick it to schedule") rather than the hard red warning.
  const idOf = (t: { gid?: string; adhocId?: string }) => t.gid ?? t.adhocId ?? '';
  const blockIsMustDo = (p: EditableProposal): boolean =>
    (!!p.task && mustDoIds.has(idOf(p.task))) ||
    (Array.isArray(p.tasks) && p.tasks.some(t => mustDoIds.has(idOf(t))));
  const placedInWorkingHours = new Set<string>();
  const placedInOverflow = new Set<string>();
  for (const p of proposals) {
    const target = p.overflow ? placedInOverflow : placedInWorkingHours;
    if (p.task && mustDoIds.has(idOf(p.task))) target.add(idOf(p.task));
    if (p.tasks) for (const t of p.tasks) if (mustDoIds.has(idOf(t))) target.add(idOf(t));
  }
  const titleById = new Map<string, string>();
  for (const cat of taskCats ?? []) for (const c of cat.candidates) titleById.set(c.id, c.title);
  // Must-dos with no slot at all → hard warning; must-dos only in overflow →
  // soft "tick it" notice; anything in working hours is fine.
  const unplacedMustDo = [...mustDoIds].filter(
    id => !placedInWorkingHours.has(id) && !placedInOverflow.has(id)
  );
  const overflowOnlyMustDo = [...mustDoIds].filter(
    id => !placedInWorkingHours.has(id) && placedInOverflow.has(id)
  );

  return (
    <>
      {unplacedMustDo.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-500" />
          <div className="text-xs text-red-700">
            <p className="font-medium mb-1">
              {unplacedMustDo.length} must-do task{unplacedMustDo.length === 1 ? '' : 's'} could not
              be scheduled:
            </p>
            <ul className="space-y-0.5">
              {unplacedMustDo.map(id => (
                <li key={id}>{titleById.get(id) ?? id}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {overflowOnlyMustDo.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-indigo-50 border border-indigo-200 p-3">
          <Moon className="w-4 h-4 mt-0.5 flex-shrink-0 text-indigo-500" />
          <div className="text-xs text-indigo-700">
            <p className="font-medium mb-1">
              {overflowOnlyMustDo.length} must-do task
              {overflowOnlyMustDo.length === 1 ? '' : 's'} only fit
              {overflowOnlyMustDo.length === 1 ? 's' : ''} in the evening overflow — tick
              {overflowOnlyMustDo.length === 1 ? ' it' : ' them'} below to schedule:
            </p>
            <ul className="space-y-0.5">
              {overflowOnlyMustDo.map(id => (
                <li key={id}>{titleById.get(id) ?? id}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {exerciseMissingDays.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-500" />
          <div className="text-xs text-red-700">
            <p className="font-medium mb-1">
              Exercise couldn&apos;t be scheduled on{' '}
              {exerciseMissingDays.length === 1 ? 'a day' : `${exerciseMissingDays.length} days`} — no free
              hour:
            </p>
            <ul className="space-y-0.5">
              {exerciseMissingDays.map(d => (
                <li key={d}>{format(parseISO(d), 'EEEE, MMM d')}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {quotaSummary.some(q => q.unmet > 0) && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-3">
          <p className="text-xs font-medium text-amber-800 mb-1">Quota not fully met</p>
          <ul className="text-xs text-amber-700 space-y-0.5">
            {quotaSummary
              .filter(q => q.unmet > 0)
              .map(q => (
                <li key={q.category}>
                  {q.category}: {q.existing + q.proposed}/{q.weeklyCount} scheduled ({q.unmet}{' '}
                  short)
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="space-y-4">
        {grouped.map(group => (
          <div key={group.date}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
              {format(parseISO(group.date), 'EEEE, MMM d')}
            </h3>
            <ul className="space-y-2">
              {group.items.map(p => {
                const isPrep = p.kind === 'prep';
                const isRitual = p.kind === 'ritual';
                const isBreak = p.kind === 'break';
                const isGrouped = Array.isArray(p.tasks);
                const color = categoryColor(p.category);
                const result = results[p.id];
                const label = isPrep
                  ? p.meeting?.title ?? 'Prep'
                  : isRitual || isBreak
                    ? p.title ?? p.category
                    : isGrouped
                      ? `${p.tasks!.length} task${p.tasks!.length === 1 ? '' : 's'}`
                      : p.task
                        ? p.task.title
                        : 'Reserved';
                return (
                  <li
                    key={p.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 ${
                      p.accepted ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={p.accepted}
                      onChange={() => toggleAccept(p.id)}
                      disabled={hasResults}
                      className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {isPrep ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            Prep
                          </span>
                        ) : isRitual ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-teal-100 text-teal-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                            Ritual
                          </span>
                        ) : isBreak ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Break
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${color.bg} ${color.text}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                            {p.category}
                          </span>
                        )}
                        <span
                          className="text-sm font-medium text-gray-800 truncate"
                          title={p.reason}
                        >
                          {label}
                        </span>
                        {blockIsMustDo(p) && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 flex-shrink-0">
                            <Flag className="w-2.5 h-2.5 fill-amber-500" />
                            Must do
                          </span>
                        )}
                      </div>
                      {/* Grouped block: list its assigned tasks as an agenda. */}
                      {isGrouped && p.tasks!.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5 pl-1">
                          {p.tasks!.map((t, i) => (
                            <li key={t.gid ?? t.adhocId ?? i} className="text-xs text-gray-500 truncate">
                              • {t.title}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <input
                      type="time"
                      value={p.start}
                      onChange={e => editStart(p.id, e.target.value)}
                      disabled={hasResults}
                      className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                      title={timeRange(p.start, p.durationMinutes)}
                    />
                    {result &&
                      (result.success ? (
                        <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      ) : (
                        <AlertTriangle
                          className="w-4 h-4 text-red-500 flex-shrink-0"
                          aria-label={result.error}
                        />
                      ))}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* Evening overflow — optional blocks for tasks that didn't fit inside
          working hours. Default-rejected (opt-in): tick a block to schedule it. */}
      {overflowProposals.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center gap-1.5 mb-2">
            <Moon className="w-3.5 h-3.5 text-indigo-500" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
              Evening overflow (optional)
            </h3>
          </div>
          <p className="text-[11px] text-gray-400 mb-2">
            These didn&apos;t fit in your working hours. Tick any you want to schedule in the evening.
          </p>
          <ul className="space-y-2">
            {overflowProposals.map(p => {
              const result = results[p.id];
              const label = p.task ? p.task.title : p.category;
              return (
                <li
                  key={p.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 ${
                    p.accepted
                      ? 'border-indigo-200 bg-indigo-50/50'
                      : 'border-gray-100 bg-gray-50 opacity-70'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={p.accepted}
                    onChange={() => toggleAccept(p.id)}
                    disabled={hasResults}
                    className="w-4 h-4 rounded border-gray-300 text-indigo-500 focus:ring-indigo-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-100 text-indigo-700">
                        <Moon className="w-2.5 h-2.5" />
                        {format(parseISO(p.date), 'EEE')}
                      </span>
                      <span
                        className="text-sm font-medium text-gray-800 truncate"
                        title={p.reason}
                      >
                        {label}
                      </span>
                      {blockIsMustDo(p) && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 flex-shrink-0">
                          <Flag className="w-2.5 h-2.5 fill-amber-500" />
                          Must do
                        </span>
                      )}
                    </div>
                  </div>
                  <input
                    type="time"
                    value={p.start}
                    onChange={e => editStart(p.id, e.target.value)}
                    disabled={hasResults}
                    className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    title={timeRange(p.start, p.durationMinutes)}
                  />
                  {result &&
                    (result.success ? (
                      <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    ) : (
                      <AlertTriangle
                        className="w-4 h-4 text-red-500 flex-shrink-0"
                        aria-label={result.error}
                      />
                    ))}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Spare capacity — how much usable free work time is left this week, with
          an affordance to go back and pick more tasks when there's room. Hidden
          once the plan has been confirmed (results shown). */}
      {spareCapacity && !hasResults && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 border border-gray-200 p-3">
          <p className="text-sm text-gray-600">
            {spareCapacity.totalMinutes > 0 ? (
              <>
                You still have ~<span className="font-medium text-gray-800">{roughDuration(spareCapacity.totalMinutes)}</span>{' '}
                of usable free time this week
                {spareCapacity.largestGapMinutes > 0 && (
                  <> (largest gap {roughDuration(spareCapacity.largestGapMinutes)})</>
                )}
                .
              </>
            ) : (
              <>No usable free time left this week — your plan fills the working hours.</>
            )}
          </p>
          {spareCapacity.totalMinutes >= 60 && (
            <button
              onClick={addMoreTasks}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-orange-600 border border-orange-300 rounded-lg hover:bg-orange-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Add more tasks
            </button>
          )}
        </div>
      )}
    </>
  );
}
