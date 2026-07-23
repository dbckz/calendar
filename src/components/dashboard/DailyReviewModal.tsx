'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, ClipboardCheck, Loader2, Check, AlertTriangle, ArrowRight, Sparkles, Ban } from 'lucide-react';
import { format, parseISO } from 'date-fns';

import { api, type ReplanAnalyzeResponse } from '@/lib/api';
import type { ReplanReviewBlock } from '@/lib/scheduling/replan';
import { buildReviewApplyPayload, type ReviewTaskMark } from '@/lib/scheduling/daily-review';
import { categoryColor, slotLabelMs, titleLabel } from './replanFormat';
import { ReplanSections, replanHasWork } from './ReplanSections';
import { useReplanActions } from './useReplanActions';

interface DailyReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplied?: () => void; // called after any successful mutation so the caller can refresh
}

type Marks = Record<string, ReviewTaskMark[]>; // eventId -> per-task marks

function initMarks(blocks: ReplanReviewBlock[]): Marks {
  const marks: Marks = {};
  for (const b of blocks) {
    marks[b.googleEventId] = b.tasks.map(t => ({
      done: t.done,
      // Default the "complete in Asana" box on for Asana tasks the user might tick
      // done — but not for ones already complete in Asana (nothing to complete).
      completeInAsana: !!t.gid && !t.completedInAsana,
    }));
  }
  return marks;
}

export function DailyReviewModal({ isOpen, onClose, onApplied }: DailyReviewModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReplanAnalyzeResponse | null>(null);
  const [marks, setMarks] = useState<Marks>({});
  const [isApplying, setIsApplying] = useState(false);
  // Closing "how your day went" message, shown at the top of the replan step.
  // Fired (best-effort) when the review is confirmed; never blocks the apply.
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [reviewMessageLoading, setReviewMessageLoading] = useState(false);

  // Step 2 reuses the exact replan review + confirm behaviour.
  const actions = useReplanActions(step === 2 ? data : null, onApplied);

  const analyze = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.analyzeReplan();
      setData(res);
      return res;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze your week');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fresh analyze on open; seed step-1 marks from current done state.
  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setData(null);
    setMarks({});
    setError(null);
    setIsApplying(false);
    setReviewMessage(null);
    setReviewMessageLoading(false);
    analyze().then(res => {
      if (res) setMarks(initMarks(res.reviewBlocks ?? []));
    });
  }, [isOpen, analyze]);

  // Escape closes.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const weekLabel = useMemo(() => {
    if (!data) return '';
    return `${format(parseISO(data.weekStart), 'MMM d')} – ${format(parseISO(data.weekEnd), 'MMM d')}`;
  }, [data]);

  const reviewBlocks = useMemo(() => data?.reviewBlocks ?? [], [data]);

  const setTaskDone = (eventId: string, idx: number, done: boolean) =>
    setMarks(prev => {
      const list = prev[eventId] ? [...prev[eventId]] : [];
      if (list[idx]) list[idx] = { ...list[idx], done };
      return { ...prev, [eventId]: list };
    });

  const setTaskCompleteAsana = (eventId: string, idx: number, completeInAsana: boolean) =>
    setMarks(prev => {
      const list = prev[eventId] ? [...prev[eventId]] : [];
      if (list[idx]) list[idx] = { ...list[idx], completeInAsana };
      return { ...prev, [eventId]: list };
    });

  // Dismiss a bare calendar event as "not a task": remove it from the current
  // review and remember its title so it never resurfaces. Optimistic — the
  // remember call is best-effort (if it fails, the row simply returns next time).
  const dismissCalendarBlock = useCallback((block: ReplanReviewBlock) => {
    const title = block.titles[0] ?? '';
    setData(prev =>
      prev
        ? { ...prev, reviewBlocks: (prev.reviewBlocks ?? []).filter(b => b.googleEventId !== block.googleEventId) }
        : prev
    );
    setMarks(prev => {
      const next = { ...prev };
      delete next[block.googleEventId];
      return next;
    });
    if (title) api.dismissReviewTitle(title).catch(() => {});
  }, []);

  // Summarise the final marks into done/total + task titles. A block counts done
  // only if every one of its tasks is marked done (matching the apply logic).
  const summariseOutcome = useCallback(() => {
    let doneCount = 0;
    const doneTitles: string[] = [];
    const notDoneTitles: string[] = [];
    for (const block of reviewBlocks) {
      const list = marks[block.googleEventId] ?? [];
      const allDone =
        block.tasks.length > 0 &&
        block.tasks.every((t, i) => list[i]?.done ?? t.done);
      const label = titleLabel(block.titles);
      if (allDone) doneTitles.push(label);
      else notDoneTitles.push(label);
    }
    doneCount = doneTitles.length;
    return { doneCount, totalCount: reviewBlocks.length, doneTitles, notDoneTitles };
  }, [reviewBlocks, marks]);

  // Apply the step-1 marks, then re-analyze and advance to the replan step.
  const applyAndContinue = useCallback(async () => {
    setIsApplying(true);
    setError(null);
    // Fire the closing-message request now (from the marks the user just
    // confirmed) but don't await it — it must not delay or block the apply. If
    // the modal closes before it resolves, the setState is simply ignored.
    if (reviewBlocks.length > 0) {
      setReviewMessage(null);
      setReviewMessageLoading(true);
      api.getReviewMessage(summariseOutcome())
        .then(res => setReviewMessage(res.message))
        .catch(() => setReviewMessage(null))
        .finally(() => setReviewMessageLoading(false));
    }
    try {
      const payload = buildReviewApplyPayload(
        reviewBlocks,
        Object.fromEntries(Object.entries(marks).map(([id, tasks]) => [id, { tasks }]))
      );
      const hasWork =
        payload.done.length > 0 ||
        payload.notDone.length > 0 ||
        payload.completeAsana.length > 0 ||
        payload.adopt.length > 0;
      if (hasWork) {
        const res = await api.confirmReplan(
          [],
          payload.done,
          undefined,
          undefined,
          undefined,
          payload.notDone,
          payload.completeAsana,
          undefined,
          undefined,
          payload.adopt
        );
        const failed = [
          ...(res.doneResults ?? []),
          ...(res.notDoneResults ?? []),
          ...(res.adoptResults ?? []),
        ].filter(r => !r.success).length + (res.asanaResults ?? []).filter(r => !r.success).length;
        if (failed > 0) setError(`${failed} update${failed === 1 ? '' : 's'} could not be saved.`);
        onApplied?.();
      }
      // Stamp the review as completed so the next one only covers what finishes
      // after now. Best-effort — a failure here must not block the replan step.
      await api.completeDailyReview().catch(() => {});
      // Re-gather so the replan step sees the just-applied done/not-done state
      // (Asana-completed tasks drop out of the fresh incomplete fetch).
      await analyze();
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save your review');
    } finally {
      setIsApplying(false);
    }
  }, [reviewBlocks, marks, analyze, onApplied, summariseOutcome]);

  if (!isOpen) return null;

  const displayError = error ?? actions.error;
  const nothingToReplan = data && !replanHasWork(data);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-orange-500" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Daily review{step === 2 ? ' — replan' : ''}
              </h2>
              {data && (
                <p className="text-xs text-gray-400">
                  {step === 1
                    ? 'What got done since your last review?'
                    : `Reschedule what didn’t · ${weekLabel}`}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {displayError && (
            <div className="mb-4 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{displayError}</span>
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
              <p className="text-sm text-gray-500">
                {step === 1 ? 'Gathering what you had planned…' : 'Checking what still needs a slot…'}
              </p>
            </div>
          ) : !data ? null : step === 1 ? (
            reviewBlocks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
                <Check className="w-8 h-8 text-emerald-500" />
                <p className="text-sm font-medium text-gray-700">Nothing to review yet.</p>
                <p className="text-xs text-gray-400">
                  No planned blocks have finished. Come back at the end of the day.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {reviewBlocks.map(block => (
                  <ReviewRow
                    key={block.googleEventId}
                    block={block}
                    marks={marks[block.googleEventId] ?? []}
                    onToggleDone={(idx, done) => setTaskDone(block.googleEventId, idx, done)}
                    onToggleAsana={(idx, v) => setTaskCompleteAsana(block.googleEventId, idx, v)}
                    onDismiss={block.source === 'calendar' ? () => dismissCalendarBlock(block) : undefined}
                  />
                ))}
              </ul>
            )
          ) : (
            <>
              {(reviewMessageLoading || reviewMessage) && (
                <ReviewMessageCard message={reviewMessage} loading={reviewMessageLoading} />
              )}
              {nothingToReplan ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
                  <Check className="w-8 h-8 text-emerald-500" />
                  <p className="text-sm font-medium text-gray-700">Nothing left to reschedule.</p>
                  <p className="text-xs text-gray-400">
                    Everything unfinished either has no home this week or is already handled.
                  </p>
                </div>
              ) : (
                <ReplanSections data={data} actions={actions} />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200">
          {step === 1 ? (
            <>
              <button
                onClick={onClose}
                className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              {data && (
                <button
                  onClick={applyAndContinue}
                  disabled={isLoading || isApplying}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Save &amp; replan
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </>
          ) : actions.done || nothingToReplan ? (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Close
              </button>
              {data && replanHasWork(data) && (
                <button
                  onClick={actions.confirm}
                  disabled={isLoading || actions.isConfirming || actions.actionCount === 0}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {actions.isConfirming && <Loader2 className="w-4 h-4 animate-spin" />}
                  Apply {actions.actionCount > 0 ? actions.actionCount : ''} change
                  {actions.actionCount === 1 ? '' : 's'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// The closing "how your day went" reflection, shown at the top of the replan
// step. A soft emerald card; while the message is still generating it shows a
// subtle shimmer placeholder so the space doesn't jump when the text arrives.
function ReviewMessageCard({ message, loading }: { message: string | null; loading: boolean }) {
  return (
    <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5">
      <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-500" />
      {message ? (
        <p className="text-sm text-emerald-900 leading-relaxed">{message}</p>
      ) : loading ? (
        <div className="flex-1 space-y-1.5 py-0.5" aria-hidden>
          <div className="h-3 w-full rounded bg-emerald-200/70 animate-pulse" />
          <div className="h-3 w-2/3 rounded bg-emerald-200/70 animate-pulse" />
        </div>
      ) : null}
    </div>
  );
}

// One review row. Single-task blocks get a Done / Didn't-do segmented toggle;
// grouped blocks list each task with its own Done checkbox (a shared block can be
// partially done). Asana-backed tasks marked done show a default-on "Complete in
// Asana" checkbox.
function ReviewRow({
  block,
  marks,
  onToggleDone,
  onToggleAsana,
  onDismiss,
}: {
  block: ReplanReviewBlock;
  marks: ReviewTaskMark[];
  onToggleDone: (idx: number, done: boolean) => void;
  onToggleAsana: (idx: number, v: boolean) => void;
  // Present only for bare calendar events: dismiss the row as "not a task".
  onDismiss?: () => void;
}) {
  const color = categoryColor(block.category);
  const grouped = block.tasks.length > 1;

  return (
    <li className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${color.bg} ${color.text}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
              {block.category}
            </span>
            <span className="text-sm font-medium text-gray-800 truncate">
              {titleLabel(block.titles)}
            </span>
            {block.source === 'calendar' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500">
                From your calendar
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
            <span>{slotLabelMs(block.startMs)}</span>
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="inline-flex items-center gap-0.5 text-gray-400 hover:text-gray-600 transition-colors"
                title="Not a task — hide this event and don’t show it again"
              >
                <Ban className="w-3 h-3" />
                Not a task
              </button>
            )}
          </div>
        </div>

        {/* Single-task blocks: Done / Didn't-do segmented control. */}
        {!grouped && (
          <div className="inline-flex rounded-md border border-gray-200 overflow-hidden text-[11px] font-medium flex-shrink-0">
            {[
              { v: true, label: 'Done' },
              { v: false, label: 'Didn’t do' },
            ].map(opt => (
              <button
                key={opt.label}
                onClick={() => onToggleDone(0, opt.v)}
                className={`px-2.5 py-1 transition-colors ${
                  (marks[0]?.done ?? false) === opt.v
                    ? opt.v
                      ? 'bg-emerald-500 text-white'
                      : 'bg-gray-500 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Grouped block: per-task Done checkboxes. */}
      {grouped && (
        <ul className="mt-2 space-y-1.5 pl-1">
          {block.tasks.map((t, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={marks[i]?.done ?? false}
                onChange={e => onToggleDone(i, e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-emerald-500 focus:ring-emerald-500"
              />
              <span className={`text-sm ${marks[i]?.done ? 'text-gray-800' : 'text-gray-500'} truncate flex-1`}>
                {t.title}
              </span>
              {t.completedInAsana ? (
                <span className="text-[11px] text-emerald-600 flex-shrink-0">Already completed in Asana</span>
              ) : (
                t.gid && marks[i]?.done && (
                  <label className="flex items-center gap-1 text-[11px] text-gray-500 flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={marks[i]?.completeInAsana ?? false}
                      onChange={e => onToggleAsana(i, e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                    />
                    Complete in Asana
                  </label>
                )
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Single Asana task already complete in Asana: explain the pre-ticked Done. */}
      {!grouped && block.tasks[0]?.completedInAsana && (
        <div className="mt-2 text-[11px] text-emerald-600">Already completed in Asana</div>
      )}

      {/* Single Asana task marked done (and not already complete): complete-in-Asana affordance. */}
      {!grouped && block.tasks[0]?.gid && !block.tasks[0]?.completedInAsana && marks[0]?.done && (
        <label className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-500">
          <input
            type="checkbox"
            checked={marks[0]?.completeInAsana ?? false}
            onChange={e => onToggleAsana(0, e.target.checked)}
            className="w-3.5 h-3.5 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
          />
          Complete in Asana
        </label>
      )}
    </li>
  );
}
