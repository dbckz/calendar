'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

import { api } from '@/lib/api';
import { periodLabel } from '@/lib/goal-periods';
import { sectionLabel } from '@/lib/life-sections';
import type { GoalPeriodKind, GoalStatus, Scorecard, ScorecardVerdict } from '@/types/life';
import { GoalPacingBar } from './GoalPacingBar';

const VERDICTS: Array<{ verdict: Exclude<ScorecardVerdict, 'unknown'>; label: string; className: string }> = [
  { verdict: 'hit', label: 'Hit', className: 'bg-emerald-600 text-white' },
  { verdict: 'partial', label: 'Partial', className: 'bg-amber-500 text-white' },
  { verdict: 'missed', label: 'Missed', className: 'bg-red-600 text-white' },
  { verdict: 'dropped', label: 'Dropped', className: 'bg-gray-500 text-white' },
];

interface ReflectionModalProps {
  periodKind: GoalPeriodKind;
  periodKey: string;
  onClose: () => void;
  onFinished: () => void;
}

// A guided close-out of a period: the scorecard is derived from the evidence
// first, so the session starts from what actually happened rather than a blank
// page. Every verdict is pre-filled and overridable — the numbers inform the
// call, they don't make it.
export function ReflectionModal({ periodKind, periodKey, onClose, onFinished }: ReflectionModalProps) {
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0); // 0 = overview, 1..n = per goal, n+1 = wrap-up
  const [verdicts, setVerdicts] = useState<Record<string, Exclude<ScorecardVerdict, 'unknown'>>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getScorecard(periodKind, periodKey)
      .then(res => {
        if (cancelled) return;
        setScorecard(res.scorecard);
        // Seed every goal with the evidence-derived verdict; 'unknown' has no
        // sensible default, so it is left for Dave to choose.
        setVerdicts(
          Object.fromEntries(
            res.scorecard.rows
              .filter(r => r.suggestedVerdict !== 'unknown')
              .map(r => [r.goal.id, r.suggestedVerdict as Exclude<ScorecardVerdict, 'unknown'>])
          )
        );
        setNotes(
          Object.fromEntries(res.scorecard.rows.map(r => [r.goal.id, r.goal.reflection ?? '']))
        );
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the scorecard.');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [periodKind, periodKey]);

  // Memoised because `finish` depends on it; a fresh [] each render would
  // rebuild that callback every time.
  const rows = useMemo(() => scorecard?.rows ?? [], [scorecard]);
  const lastStep = rows.length + 1;

  const finish = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      // Persist each verdict as the goal's terminal status plus its note.
      await Promise.all(
        rows.map(row => {
          const verdict = verdicts[row.goal.id];
          const reflection = notes[row.goal.id]?.trim();
          if (!verdict && !reflection) return Promise.resolve(null);
          return api.updateGoal(row.goal.id, {
            ...(verdict ? { status: verdict as GoalStatus } : {}),
            ...(reflection ? { reflection } : {}),
          });
        })
      );
      onFinished();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the reflection.');
      setSaving(false);
    }
  }, [rows, verdicts, notes, onFinished]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-semibold text-gray-900">
              {periodKind === 'month' ? 'Monthly' : 'Quarterly'} reflection
            </h2>
            <p className="text-sm text-gray-500">{periodLabel(periodKind, periodKey)}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Close">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading && <p className="text-sm text-gray-500">Building the scorecard…</p>}
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

          {!loading && scorecard && rows.length === 0 && (
            <p className="text-sm text-gray-600">
              No goals were set for {periodLabel(periodKind, periodKey)}, so there is nothing to
              reflect on. Use the planning session to set some for the period ahead.
            </p>
          )}

          {!loading && scorecard && rows.length > 0 && step === 0 && (
            <Overview scorecard={scorecard} />
          )}

          {!loading && step > 0 && step <= rows.length && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                Goal {step} of {rows.length} · {sectionLabel(rows[step - 1].goal.sectionId)}
              </p>
              <h3 className="font-semibold text-gray-900">{rows[step - 1].goal.title}</h3>
              {rows[step - 1].goal.detail && (
                <p className="mt-1 text-sm text-gray-600">{rows[step - 1].goal.detail}</p>
              )}

              <div className="mt-3">
                <GoalPacingBar
                  progress={rows[step - 1].progress}
                  target={rows[step - 1].goal.target}
                />
              </div>

              <fieldset className="mt-4">
                <legend className="text-xs font-semibold text-gray-600 mb-1.5">How did it go?</legend>
                <div className="flex flex-wrap gap-2">
                  {VERDICTS.map(v => {
                    const selected = verdicts[rows[step - 1].goal.id] === v.verdict;
                    const suggested = rows[step - 1].suggestedVerdict === v.verdict;
                    return (
                      <button
                        key={v.verdict}
                        onClick={() =>
                          setVerdicts(prev => ({ ...prev, [rows[step - 1].goal.id]: v.verdict }))
                        }
                        className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${
                          selected ? v.className : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {v.label}
                        {suggested && <span className="ml-1 text-[10px] opacity-70">suggested</span>}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <label className="block mt-4">
                <span className="block text-xs font-semibold text-gray-600 mb-1">
                  What happened, and what would you do differently?
                </span>
                <textarea
                  value={notes[rows[step - 1].goal.id] ?? ''}
                  onChange={e =>
                    setNotes(prev => ({ ...prev, [rows[step - 1].goal.id]: e.target.value }))
                  }
                  rows={4}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                />
              </label>
            </div>
          )}

          {!loading && rows.length > 0 && step === lastStep && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Ready to close out</h3>
              <p className="text-sm text-gray-600 mb-3">
                Saving records each verdict against its goal, so the period is closed and the next
                planning session can start from it.
              </p>
              <ul className="space-y-1.5 text-sm">
                {rows.map(row => (
                  <li key={row.goal.id} className="flex items-start justify-between gap-3">
                    <span className="text-gray-800">{row.goal.title}</span>
                    <span className="shrink-0 font-semibold text-gray-500 uppercase text-[11px] tracking-wide">
                      {verdicts[row.goal.id] ?? 'not set'}
                    </span>
                  </li>
                ))}
              </ul>
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
              disabled={loading || rows.length === 0}
              className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:opacity-40"
            >
              {step === 0 ? 'Start' : 'Next'}
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={finish}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save reflection'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Overview({ scorecard }: { scorecard: Scorecard }) {
  const rate = scorecard.scored > 0 ? Math.round((scorecard.hit / scorecard.scored) * 100) : null;
  return (
    <div>
      <h3 className="font-semibold text-gray-900 mb-3">Where the period landed</h3>
      <div className="grid grid-cols-4 gap-2 mb-4">
        <Stat label="Hit" value={scorecard.hit} className="text-emerald-700" />
        <Stat label="Partial" value={scorecard.partial} className="text-amber-700" />
        <Stat label="Missed" value={scorecard.missed} className="text-red-700" />
        <Stat label="Dropped" value={scorecard.dropped} className="text-gray-500" />
      </div>
      {rate !== null && (
        <p className="text-sm text-gray-600 mb-3">
          {rate}% of the {scorecard.scored} goals that were being pursued were hit outright.
        </p>
      )}
      <p className="text-sm text-gray-500">
        The next steps walk through each goal one at a time with its evidence, so you can confirm or
        overrule the suggested verdict.
      </p>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-center">
      <div className={`text-2xl font-bold ${className}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
    </div>
  );
}
