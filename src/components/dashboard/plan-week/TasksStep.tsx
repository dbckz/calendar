'use client';

import { Dispatch, SetStateAction } from 'react';
import { Loader2, CheckCircle2, Star, Flag, ExternalLink } from 'lucide-react';
import { format, parseISO } from 'date-fns';

import type {
  WeekCandidateCategory,
  WeekCandidate,
  SpareCapacity,
} from '@/lib/api';
import {
  categoryColor,
  roughDuration,
  blockLengthOptions,
  RowSelect,
  PARKED_IDEAS_NOTE,
} from './helpers';

interface TasksStepProps {
  taskCats: WeekCandidateCategory[] | null;
  selections: Record<string, Set<string>>;
  taskDurations: Record<string, number>;
  setTaskDurations: Dispatch<SetStateAction<Record<string, number>>>;
  taskDurationOverrides: Record<string, number>;
  setTaskDurationOverrides: Dispatch<SetStateAction<Record<string, number>>>;
  mustDoIds: Set<string>;
  completingIds: Set<string>;
  addMoreMode: boolean;
  spareCapacity: SpareCapacity | null;
  toggleSelection: (category: string, id: string, remainingQuota: number | null) => void;
  toggleMustDo: (category: string, id: string) => void;
  completeAsana: (id: string, gid: string, integrationId: string) => void;
}

export function TasksStep({
  taskCats,
  selections,
  taskDurations,
  setTaskDurations,
  taskDurationOverrides,
  setTaskDurationOverrides,
  mustDoIds,
  completingIds,
  addMoreMode,
  spareCapacity,
  toggleSelection,
  toggleMustDo,
  completeAsana,
}: TasksStepProps) {
  if (!taskCats) {
    return (
      <p className="text-sm text-gray-400 italic py-8 text-center">No candidates available.</p>
    );
  }
  if (taskCats.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic py-8 text-center">
        No quota categories to fill this week.
      </p>
    );
  }

  // Open-in-Asana + mark-done controls for an Asana-backed candidate (has a
  // gid). Both stopPropagation so they don't toggle the row's checkbox.
  const renderAsanaControls = (c: WeekCandidate) => {
    if (!c.gid) return null;
    const completing = completingIds.has(c.id);
    return (
      <>
        <a
          href={`https://app.asana.com/0/0/${c.gid}/f`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          title="Open in Asana"
          aria-label={`Open "${c.title}" in Asana`}
          className="p-1 text-gray-400 hover:text-gray-600 flex-shrink-0"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
        {c.integrationId && (
          <button
            type="button"
            disabled={completing}
            onClick={e => {
              e.stopPropagation();
              completeAsana(c.id, c.gid!, c.integrationId!);
            }}
            title="Mark done in Asana"
            aria-label={`Mark "${c.title}" done in Asana`}
            className="p-1 text-gray-400 hover:text-emerald-600 flex-shrink-0 disabled:opacity-50"
          >
            {completing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </>
    );
  };

  // Tiny muted pill showing which Asana integration/workspace a task comes
  // from (e.g. "DBC" / "OM"). Nothing rendered for ad-hoc tasks.
  const renderIntegrationBadge = (name?: string) =>
    name ? (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-gray-100 text-gray-500 flex-shrink-0">
        {name}
      </span>
    ) : null;

  // "Must do this week" toggle for a selectable row.
  const renderMustDo = (category: string, id: string) => {
    const on = mustDoIds.has(id);
    return (
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          toggleMustDo(category, id);
        }}
        title={on ? 'Must do this week — flagged' : 'Flag as must do this week'}
        aria-pressed={on}
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border flex-shrink-0 transition-colors ${
          on
            ? 'bg-amber-100 text-amber-700 border-amber-300'
            : 'text-gray-400 border-gray-200 hover:bg-gray-100'
        }`}
      >
        <Flag className={`w-3 h-3 ${on ? 'fill-amber-500' : ''}`} />
        Must do
      </button>
    );
  };

  // Compact per-task block-length select for single-task category rows. Default
  // = the category's target length; only explicit picks are stored in
  // taskDurationOverrides.
  const renderTaskDurationSelect = (candidateId: string, defaultDuration: number) => (
    <RowSelect
      value={taskDurationOverrides[candidateId] ?? defaultDuration}
      options={blockLengthOptions(defaultDuration)}
      onChange={v =>
        setTaskDurationOverrides(prev => ({ ...prev, [candidateId]: Number(v) }))
      }
      ariaLabel="Block length"
    />
  );

  return (
    <div className="space-y-5">
      {addMoreMode && (
        <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm text-orange-800">
          {spareCapacity && spareCapacity.totalMinutes > 0
            ? `You have ~${roughDuration(spareCapacity.totalMinutes)} spare — pick extra tasks to fill it. Quota caps are lifted here, so you can select beyond a category's weekly target.`
            : `Pick extra tasks to fill your remaining free time. Quota caps are lifted here, so you can select beyond a category's weekly target.`}
        </div>
      )}
      {taskCats.map(cat => {
        const color = categoryColor(cat.category);
        const picked = selections[cat.category] ?? new Set<string>();
        // No-quota categories have no cap; autoSelect never applies to them.
        const autoN = cat.remainingQuota === null
          ? cat.candidates.length
          : Math.min(cat.remainingQuota, cat.candidates.length);
        const defaultDuration = cat.targetLengthMinutes || 30;
        // Effective selection cap: "Add more tasks" mode lifts every category's
        // cap (null = unlimited) so the user can over-select beyond quota —
        // EXCEPT a category with an explicit maxSelection, whose cap always
        // holds (a shared-agenda category gains nothing from extra picks).
        const cap = addMoreMode && !cat.hasMaxSelection ? null : cat.remainingQuota;
        return (
          <div key={cat.category} className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${color.bg} ${color.text}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                  {cat.category}
                </span>
                {(cat.deferredCount ?? 0) > 0 && (
                  <span className="text-[11px] text-gray-400 italic">
                    {cat.deferredCount} deferred to next week
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {cat.autoSelect ? (
                  <span className="text-[11px] text-gray-400">
                    Auto-picking {autoN} task{autoN === 1 ? '' : 's'}
                  </span>
                ) : cap === null ? (
                  <span className="text-[11px] text-gray-400">
                    Pick any · {picked.size} selected
                  </span>
                ) : (
                  <span className="text-[11px] text-gray-400">
                    Pick up to {cap} · {picked.size} selected
                  </span>
                )}
                {/* Grouped categories are shared containers, so their length is
                    set once at the category level. Single-task categories set
                    length per task on each row below. */}
                {cat.grouped && (
                  <label className="flex items-center gap-1.5 text-[11px] text-gray-500">
                    Block length
                    <select
                      value={taskDurations[cat.category] ?? defaultDuration}
                      onChange={e =>
                        setTaskDurations(prev => ({ ...prev, [cat.category]: Number(e.target.value) }))
                      }
                      className="text-sm border border-gray-300 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    >
                      {blockLengthOptions(defaultDuration).map(o => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </div>

            {cat.candidates.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No candidate tasks.</p>
            ) : cat.autoSelect ? (
              <ul className="space-y-1.5">
                {cat.candidates.slice(0, autoN).map(c => (
                  <li key={c.id} className="flex items-center gap-2">
                    <span className="text-sm text-gray-500 truncate flex-1">{c.title}</span>
                    {renderIntegrationBadge(c.integrationName)}
                    {renderAsanaControls(c)}
                    {!cat.grouped && renderTaskDurationSelect(c.id, defaultDuration)}
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <ul className="space-y-1.5">
                  {cat.candidates.map(c => {
                    const isMustDo = mustDoIds.has(c.id);
                    const checked = picked.has(c.id) || isMustDo;
                    const atCap = cap !== null && picked.size >= cap;
                    return (
                      <li key={c.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          // Must-do rows are force-selected; unflag to deselect.
                          disabled={isMustDo || (!checked && atCap)}
                          onChange={() => toggleSelection(cat.category, c.id, cap)}
                          className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500 disabled:opacity-40"
                        />
                        {c.isPriority && (
                          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 flex-shrink-0" />
                        )}
                        <span className="text-sm text-gray-700 truncate flex-1">{c.title}</span>
                        {renderIntegrationBadge(c.integrationName)}
                        {c.dueDate && (
                          <span className="text-[11px] text-gray-400 flex-shrink-0">
                            {format(parseISO(c.dueDate), 'MMM d')}
                          </span>
                        )}
                        {renderMustDo(cat.category, c.id)}
                        {renderAsanaControls(c)}
                        {!cat.grouped && renderTaskDurationSelect(c.id, defaultDuration)}
                      </li>
                    );
                  })}
                </ul>
                {cap !== null && picked.size < cap && (
                  <p className="mt-2 text-[11px] text-gray-400">
                    {cap - picked.size} unpicked slot
                    {cap - picked.size === 1 ? '' : 's'} will be kept as reserved
                    time.
                  </p>
                )}
              </>
            )}
          </div>
        );
      })}
      <p className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
        {PARKED_IDEAS_NOTE}
      </p>
    </div>
  );
}
