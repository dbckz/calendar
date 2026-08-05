'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';

import { api } from '@/lib/api';
import {
  isPeriodOver,
  periodLabel,
  previousPeriodKey,
  quarterKeyForMonth,
} from '@/lib/goal-periods';
import { goalSections } from '@/lib/life-sections';
import type { Goal, GoalPeriodKind, Scorecard } from '@/types/life';

interface DraftGoal {
  key: string;
  sectionId: string;
  title: string;
  targetValue: string;
  targetUnit: string;
  parentGoalId: string;
}

interface PlanningModalProps {
  periodKind: GoalPeriodKind;
  // The period being planned (usually the one about to start).
  periodKey: string;
  onClose: () => void;
  onFinished: () => void;
}

// Setting goals for the period ahead, one life area at a time, with the
// previous period's outcome on screen as context. Monthly sessions offer the
// containing quarter's goals as parents so a month's work ladders up rather
// than floating free.
export function PlanningModal({ periodKind, periodKey, onClose, onFinished }: PlanningModalProps) {
  const sections = useMemo(() => goalSections(), []);
  const [step, setStep] = useState(0); // 0 = context, 1..n = one per section, n+1 = review
  const [previous, setPrevious] = useState<Scorecard | null>(null);
  const [quarterGoals, setQuarterGoals] = useState<Goal[]>([]);
  const [existing, setExisting] = useState<Goal[]>([]);
  const [drafts, setDrafts] = useState<DraftGoal[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const lastStep = sections.length + 1;

  // Planning next month usually happens while THIS month is still running, so
  // the period shown as context may not be finished. A hit/missed verdict on a
  // live period would be wrong — show where it has got to instead.
  const previousKey = previousPeriodKey(periodKind, periodKey);
  const previousFinished = isPeriodOver(periodKind, previousKey);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      api.getScorecard(periodKind, previousKey).catch(() => null),
      // Parents for a monthly session: the quarterly goals of the quarter this
      // month sits in.
      periodKind === 'month'
        ? api
            .getGoals({ periodKind: 'quarter', periodKey: quarterKeyForMonth(periodKey) })
            .catch(() => ({ goals: [] as Goal[] }))
        : Promise.resolve({ goals: [] as Goal[] }),
      api.getGoals({ periodKind, periodKey }).catch(() => ({ goals: [] as Goal[] })),
    ])
      .then(([scorecardRes, quarterRes, existingRes]) => {
        if (cancelled) return;
        setPrevious(scorecardRes?.scorecard ?? null);
        setQuarterGoals(quarterRes.goals);
        setExisting(existingRes.goals);
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [periodKind, periodKey, previousKey]);

  const addDraft = (sectionId: string) =>
    setDrafts(prev => [
      ...prev,
      {
        // Index-free key so removing a row never re-keys the others mid-edit.
        key: `${sectionId}-${prev.length}-${Math.random().toString(36).slice(2, 8)}`,
        sectionId,
        title: '',
        targetValue: '',
        targetUnit: '',
        parentGoalId: '',
      },
    ]);

  const updateDraft = (key: string, patch: Partial<DraftGoal>) =>
    setDrafts(prev => prev.map(d => (d.key === key ? { ...d, ...patch } : d)));

  const removeDraft = (key: string) => setDrafts(prev => prev.filter(d => d.key !== key));

  const filled = drafts.filter(d => d.title.trim());

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      for (const draft of filled) {
        const value = Number(draft.targetValue);
        await api.createGoal({
          sectionId: draft.sectionId,
          periodKind,
          periodKey,
          title: draft.title.trim(),
          ...(draft.targetValue.trim() && Number.isFinite(value) && value > 0
            ? { target: { value, unit: draft.targetUnit.trim() || undefined } }
            : {}),
          ...(periodKind === 'month' && draft.parentGoalId
            ? { parentGoalId: draft.parentGoalId }
            : {}),
        });
      }
      onFinished();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the goals.');
      setSaving(false);
    }
  };

  const currentSection = step > 0 && step <= sections.length ? sections[step - 1] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-semibold text-gray-900">
              {periodKind === 'month' ? 'Monthly' : 'Quarterly'} planning
            </h2>
            <p className="text-sm text-gray-500">Setting goals for {periodLabel(periodKind, periodKey)}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Close">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading && <p className="text-sm text-gray-500">Loading context…</p>}
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

          {!loading && step === 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Where you&apos;re starting from</h3>
              {previous && previous.rows.length > 0 ? (
                <>
                  <p className="text-sm text-gray-600 mb-3">
                    {periodLabel(periodKind, previous.periodKey)}
                    {previousFinished
                      ? `: ${previous.hit} hit, ${previous.partial} partial, ${previous.missed} missed.`
                      : ' is still running, so this is where it has got to so far.'}
                  </p>
                  <ul className="space-y-1.5 text-sm mb-4">
                    {previous.rows.map(row => (
                      <li key={row.goal.id} className="flex items-start justify-between gap-3">
                        <span className="text-gray-800">{row.goal.title}</span>
                        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          {previousFinished
                            ? row.suggestedVerdict
                            : row.goal.target
                              ? `${row.progress.actual ?? 0} / ${row.goal.target.value}`
                              : row.progress.pace}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-gray-600 mb-4">
                  No goals recorded for {periodLabel(periodKind, previousKey)}.
                </p>
              )}

              {existing.length > 0 && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
                  {existing.length} goal{existing.length === 1 ? '' : 's'} already set for{' '}
                  {periodLabel(periodKind, periodKey)}. Anything you add here is added alongside them.
                </p>
              )}

              <p className="mt-4 text-sm text-gray-500">
                The next steps go through each life area in turn.
              </p>
            </div>
          )}

          {!loading && currentSection && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
                Area {step} of {sections.length}
              </p>
              <h3 className="font-semibold text-gray-900 mb-3">{currentSection.label}</h3>

              <ExistingForSection goals={existing} sectionId={currentSection.id} />

              <div className="space-y-3">
                {drafts
                  .filter(d => d.sectionId === currentSection.id)
                  .map(draft => (
                    <DraftRow
                      key={draft.key}
                      draft={draft}
                      periodKind={periodKind}
                      parents={quarterGoals.filter(g => g.sectionId === currentSection.id)}
                      onChange={patch => updateDraft(draft.key, patch)}
                      onRemove={() => removeDraft(draft.key)}
                    />
                  ))}
              </div>

              <button
                onClick={() => addDraft(currentSection.id)}
                className="mt-3 flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 border border-dashed border-gray-300 rounded-md hover:bg-gray-50 w-full justify-center"
              >
                <Plus className="w-4 h-4" />
                Add a goal for {currentSection.label}
              </button>
            </div>
          )}

          {!loading && step === lastStep && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">
                {filled.length} goal{filled.length === 1 ? '' : 's'} to create
              </h3>
              {filled.length === 0 ? (
                <p className="text-sm text-gray-600">
                  Nothing to save. Go back and add at least one goal, or close the session.
                </p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {filled.map(draft => (
                    <li key={draft.key} className="flex items-start justify-between gap-3">
                      <span className="text-gray-800">{draft.title}</span>
                      <span className="shrink-0 text-[11px] text-gray-500">
                        {sections.find(s => s.id === draft.sectionId)?.label}
                        {draft.targetValue && ` · ${draft.targetValue} ${draft.targetUnit}`.trimEnd()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200">
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          {step < lastStep ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={loading}
              className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:opacity-40"
            >
              {step === 0 ? 'Start' : 'Next'}
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={save}
              disabled={saving || filled.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : `Create ${filled.length} goal${filled.length === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ExistingForSection({ goals, sectionId }: { goals: Goal[]; sectionId: string }) {
  const mine = goals.filter(g => g.sectionId === sectionId);
  if (mine.length === 0) return null;
  return (
    <div className="mb-3 p-3 rounded-md bg-gray-50 border border-gray-200">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
        Already set for this period
      </p>
      <ul className="text-sm text-gray-700 space-y-0.5">
        {mine.map(g => (
          <li key={g.id}>{g.title}</li>
        ))}
      </ul>
    </div>
  );
}

function DraftRow({
  draft,
  periodKind,
  parents,
  onChange,
  onRemove,
}: {
  draft: DraftGoal;
  periodKind: GoalPeriodKind;
  parents: Goal[];
  onChange: (patch: Partial<DraftGoal>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="p-3 rounded-md border border-gray-200">
      <div className="flex items-start gap-2">
        <input
          value={draft.title}
          onChange={e => onChange({ title: e.target.value })}
          placeholder="What are you aiming for?"
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md"
        />
        <button
          onClick={onRemove}
          className="p-2 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"
          aria-label="Remove this goal"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          type="number"
          min="0"
          value={draft.targetValue}
          onChange={e => onChange({ targetValue: e.target.value })}
          placeholder="Target"
          className="w-24 px-2 py-1.5 text-sm border border-gray-300 rounded-md"
        />
        <input
          value={draft.targetUnit}
          onChange={e => onChange({ targetUnit: e.target.value })}
          placeholder="unit"
          className="w-28 px-2 py-1.5 text-sm border border-gray-300 rounded-md"
        />
        {periodKind === 'month' && parents.length > 0 && (
          <select
            value={draft.parentGoalId}
            onChange={e => onChange({ parentGoalId: e.target.value })}
            className="flex-1 min-w-40 px-2 py-1.5 text-sm border border-gray-300 rounded-md"
          >
            <option value="">Not linked to a quarterly goal</option>
            {parents.map(p => (
              <option key={p.id} value={p.id}>
                Under: {p.title}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
