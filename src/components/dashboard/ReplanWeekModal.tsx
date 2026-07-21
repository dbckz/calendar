'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, RefreshCw, Loader2, Check, AlertTriangle, ArrowRight, ChevronRight, Trash2, Dumbbell } from 'lucide-react';
import { format, parseISO } from 'date-fns';

import { api, type ReplanAnalyzeResponse, type ReplanConfirmResult, type ReplanAdditionResult } from '@/lib/api';

interface ReplanWeekModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplied?: () => void; // called after a successful confirm so the caller can refresh
  // Called after "Start week from scratch" resets the week, so the caller can
  // close this modal and open the Plan-week wizard (with fresh calendar data).
  onStartFromScratch?: () => void;
}

// Deterministic pastel colour per category (mirrors PlanWeekModal so a category
// reads the same across the app).
const CATEGORY_COLORS = [
  { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-400' },
  { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-400' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-400' },
  { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-400' },
  { bg: 'bg-pink-100', text: 'text-pink-700', dot: 'bg-pink-400' },
  { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-400' },
];

function categoryColor(category: string) {
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) | 0;
  return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length];
}

function slotLabel(date: string, start: string): string {
  return `${format(parseISO(date), 'EEE MMM d')} ${start}`;
}

function titleLabel(titles: string[]): string {
  if (titles.length === 0) return 'Reserved time';
  if (titles.length === 1) return titles[0];
  return `${titles[0]} +${titles.length - 1} more`;
}

// Per-missed-row action: reschedule to the proposed slot, or mark done.
type MoveMode = 'reschedule' | 'done';
// Per-stale-row action: leave untouched, mark done, or dismiss (delete record).
type StaleMode = 'leave' | 'done' | 'dismiss';

export function ReplanWeekModal({ isOpen, onClose, onApplied, onStartFromScratch }: ReplanWeekModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReplanAnalyzeResponse | null>(null);
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [moveMode, setMoveMode] = useState<Record<string, MoveMode>>({});
  const [staleMode, setStaleMode] = useState<Record<string, StaleMode>>({});
  // Missing-ritual additions: which proposal ids are checked (all default-checked,
  // exercise being priority one) + per-id creation result.
  const [additionIncluded, setAdditionIncluded] = useState<Set<string>>(new Set());
  const [additionResults, setAdditionResults] = useState<Record<string, ReplanAdditionResult>>({});
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [results, setResults] = useState<Record<string, ReplanConfirmResult>>({});
  const [done, setDone] = useState(false);
  // "Start week from scratch" inline confirm + progress.
  const [resetConfirm, setResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const analyze = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setResults({});
    setDone(false);
    try {
      const res = await api.analyzeReplan();
      setData(res);
      // Default: every proposed move is included and set to reschedule.
      setIncluded(new Set(res.moves.map(m => m.googleEventId)));
      setMoveMode(Object.fromEntries(res.moves.map(m => [m.googleEventId, 'reschedule' as MoveMode])));
      setStaleMode(Object.fromEntries((res.stale ?? []).map(s => [s.googleEventId, 'leave' as StaleMode])));
      // Every missing-ritual addition is checked by default (exercise is priority one).
      setAdditionIncluded(new Set((res.additions ?? []).map(a => a.id)));
      setAdditionResults({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze your week');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch fresh on each open; reset transient state.
  useEffect(() => {
    if (!isOpen) return;
    setData(null);
    setIncluded(new Set());
    setMoveMode({});
    setStaleMode({});
    setAdditionIncluded(new Set());
    setAdditionResults({});
    setShowUnchanged(false);
    setIsConfirming(false);
    setResults({});
    setDone(false);
    setResetConfirm(false);
    setIsResetting(false);
    analyze();
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

  const hasResults =
    Object.keys(results).length > 0 || Object.keys(additionResults).length > 0;
  const stale = useMemo(() => data?.stale ?? [], [data]);
  const additions = useMemo(() => data?.additions ?? [], [data]);

  // Partition the confirm payload from the per-row choices.
  const payload = useMemo(() => {
    const moves: Array<{ googleEventId: string; googleIntegrationId?: string; date: string; start: string; durationMinutes: number }> = [];
    const doneIds: string[] = [];
    const dismissIds: string[] = [];
    if (data) {
      for (const m of data.moves) {
        if (!included.has(m.googleEventId)) continue;
        if (m.reason === 'missed' && moveMode[m.googleEventId] === 'done') {
          doneIds.push(m.googleEventId);
        } else {
          moves.push({
            googleEventId: m.googleEventId,
            googleIntegrationId: m.googleIntegrationId,
            date: m.newDate,
            start: m.newStart,
            durationMinutes: m.durationMinutes,
          });
        }
      }
      for (const s of stale) {
        const mode = staleMode[s.googleEventId];
        if (mode === 'done') doneIds.push(s.googleEventId);
        else if (mode === 'dismiss') dismissIds.push(s.googleEventId);
      }
    }
    const additionBlocks = additions.filter(a => additionIncluded.has(a.id));
    return { moves, doneIds, dismissIds, additionBlocks };
  }, [data, included, moveMode, stale, staleMode, additions, additionIncluded]);

  const actionCount =
    payload.moves.length +
    payload.doneIds.length +
    payload.dismissIds.length +
    payload.additionBlocks.length;

  const toggle = (id: string) =>
    setIncluded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAddition = (id: string) =>
    setAdditionIncluded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirm = useCallback(async () => {
    if (!data || actionCount === 0) return;
    setIsConfirming(true);
    setError(null);
    try {
      const { results: res, doneResults, additionResults: addRes } = await api.confirmReplan(
        payload.moves,
        payload.doneIds,
        payload.dismissIds,
        payload.additionBlocks
      );
      const map: Record<string, ReplanConfirmResult> = {};
      for (const r of [...res, ...doneResults]) map[r.googleEventId] = r;
      setResults(map);
      const addMap: Record<string, ReplanAdditionResult> = {};
      for (const r of addRes ?? []) addMap[r.id] = r;
      setAdditionResults(addMap);
      if ([...res, ...doneResults, ...(addRes ?? [])].some(r => r.success)) onApplied?.();
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply changes');
    } finally {
      setIsConfirming(false);
    }
  }, [data, actionCount, payload, onApplied]);

  const resetWeek = useCallback(async () => {
    setIsResetting(true);
    setError(null);
    try {
      await api.resetWeek();
      // Hand off to the caller: close this modal and open the Plan-week wizard.
      onStartFromScratch?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset the week');
      setIsResetting(false);
      setResetConfirm(false);
    }
  }, [onStartFromScratch]);

  if (!isOpen) return null;

  const plannedCount =
    (data?.kept.length ?? 0) + (data?.moves.length ?? 0) + stale.length + (data?.unplaceable.length ?? 0);

  const nothingToDo =
    data &&
    data.moves.length === 0 &&
    data.unplaceable.length === 0 &&
    stale.length === 0 &&
    additions.length === 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-orange-500" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Replan week</h2>
              {weekLabel && <p className="text-xs text-gray-400">{weekLabel}</p>}
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
          {error && (
            <div className="mb-4 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
              <p className="text-sm text-gray-500">Checking how the rest of your week is tracking…</p>
            </div>
          ) : !data ? null : nothingToDo ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
              <Check className="w-8 h-8 text-emerald-500" />
              <p className="text-sm font-medium text-gray-700">Your week still looks on track.</p>
              <p className="text-xs text-gray-400">
                Nothing has been missed and no planned blocks now clash with a meeting.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Moving */}
              {data.moves.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                    Moving ({data.moves.length})
                  </h3>
                  <ul className="space-y-2">
                    {data.moves.map(m => {
                      const color = categoryColor(m.category);
                      const result = results[m.googleEventId];
                      const isIn = included.has(m.googleEventId);
                      const isMissed = m.reason === 'missed';
                      const mode = moveMode[m.googleEventId] ?? 'reschedule';
                      const markingDone = isMissed && mode === 'done';
                      return (
                        <li
                          key={m.googleEventId}
                          className={`flex items-start gap-3 rounded-lg border p-3 ${
                            isIn ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isIn}
                            onChange={() => toggle(m.googleEventId)}
                            disabled={hasResults}
                            className="mt-1 w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${color.bg} ${color.text}`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                                {m.category}
                              </span>
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                                  isMissed ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                                }`}
                              >
                                {isMissed ? 'missed' : 'conflict'}
                              </span>
                              <span className="text-sm font-medium text-gray-800 truncate">
                                {titleLabel(m.titles)}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                              <span className="line-through">{slotLabel(m.oldDate, m.oldStart)}</span>
                              <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                              {markingDone ? (
                                <span className="font-medium text-emerald-600">Mark done (no reschedule)</span>
                              ) : (
                                <span className="font-medium text-slate-600">
                                  {slotLabel(m.newDate, m.newStart)}
                                </span>
                              )}
                            </div>
                            {/* Missed rows: choose reschedule or mark done. */}
                            {isMissed && isIn && !hasResults && (
                              <div className="mt-2 inline-flex rounded-md border border-gray-200 overflow-hidden text-[11px] font-medium">
                                {(['reschedule', 'done'] as MoveMode[]).map(opt => (
                                  <button
                                    key={opt}
                                    onClick={() =>
                                      setMoveMode(prev => ({ ...prev, [m.googleEventId]: opt }))
                                    }
                                    className={`px-2.5 py-1 transition-colors ${
                                      mode === opt
                                        ? 'bg-orange-500 text-white'
                                        : 'bg-white text-gray-600 hover:bg-gray-50'
                                    }`}
                                  >
                                    {opt === 'reschedule' ? 'Reschedule' : 'Done'}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          {result &&
                            (result.success ? (
                              <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle
                                className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5"
                                aria-label={result.error}
                              />
                            ))}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Stale prep — meeting already happened */}
              {stale.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                    Meeting already happened ({stale.length})
                  </h3>
                  <ul className="space-y-2">
                    {stale.map(s => {
                      const result = results[s.googleEventId];
                      const mode = staleMode[s.googleEventId] ?? 'leave';
                      return (
                        <li
                          key={s.googleEventId}
                          className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-gray-800 truncate">
                                {titleLabel(s.titles)}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-gray-400">
                              No slot before the meeting — prep can no longer be rescheduled.
                            </p>
                            {!hasResults && (
                              <div className="mt-2 inline-flex rounded-md border border-gray-200 overflow-hidden text-[11px] font-medium">
                                {(['leave', 'done', 'dismiss'] as StaleMode[]).map(opt => (
                                  <button
                                    key={opt}
                                    onClick={() =>
                                      setStaleMode(prev => ({ ...prev, [s.googleEventId]: opt }))
                                    }
                                    className={`px-2.5 py-1 transition-colors ${
                                      mode === opt
                                        ? opt === 'dismiss'
                                          ? 'bg-red-500 text-white'
                                          : 'bg-orange-500 text-white'
                                        : 'bg-white text-gray-600 hover:bg-gray-50'
                                    }`}
                                  >
                                    {opt === 'leave' ? 'Leave' : opt === 'done' ? 'Mark done' : 'Dismiss'}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          {result &&
                            (result.success ? (
                              <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle
                                className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5"
                                aria-label={result.error}
                              />
                            ))}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Missing rituals — add on remaining working days */}
              {additions.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-1.5">
                    <Dumbbell className="w-3.5 h-3.5 text-emerald-500" />
                    Missing rituals ({additions.length})
                  </h3>
                  <ul className="space-y-2">
                    {additions.map(a => {
                      const color = categoryColor(a.category);
                      const result = additionResults[a.id];
                      const isIn = additionIncluded.has(a.id);
                      return (
                        <li
                          key={a.id}
                          className={`flex items-start gap-3 rounded-lg border p-3 ${
                            isIn ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isIn}
                            onChange={() => toggleAddition(a.id)}
                            disabled={hasResults}
                            className="mt-1 w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${color.bg} ${color.text}`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                                {a.category}
                              </span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-700">
                                add
                              </span>
                              <span className="text-sm font-medium text-gray-800 truncate">
                                {a.title ?? a.category}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-gray-500">
                              <span className="font-medium text-slate-600">{slotLabel(a.date, a.start)}</span>
                            </div>
                          </div>
                          {result &&
                            (result.success ? (
                              <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle
                                className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5"
                                aria-label={result.error}
                              />
                            ))}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Couldn't fit */}
              {data.unplaceable.length > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs font-medium text-amber-800 mb-1">
                    Couldn&apos;t fit ({data.unplaceable.length})
                  </p>
                  <ul className="text-xs text-amber-700 space-y-0.5">
                    {data.unplaceable.map(u => (
                      <li key={u.googleEventId}>
                        {titleLabel(u.titles)}{' '}
                        <span className="text-amber-500">
                          ({u.reason}, no free slot this week)
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Unchanged (subdued, collapsed) */}
              {data.kept.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowUnchanged(v => !v)}
                    className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-600"
                  >
                    <ChevronRight
                      className={`w-3.5 h-3.5 transition-transform ${showUnchanged ? 'rotate-90' : ''}`}
                    />
                    Unchanged ({data.kept.length})
                  </button>
                  {showUnchanged && (
                    <ul className="mt-2 space-y-1">
                      {data.kept.map(k => (
                        <li
                          key={k.googleEventId}
                          className="flex items-center gap-2 text-sm text-gray-500"
                        >
                          <span className="truncate flex-1">{titleLabel(k.titles)}</span>
                          <span className="text-[11px] text-gray-400 flex-shrink-0">
                            {slotLabel(k.date, k.start)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-gray-200">
          {/* Left: start-from-scratch destructive action / inline confirm */}
          <div className="min-w-0">
            {!done && data && !resetConfirm && (
              <button
                onClick={() => setResetConfirm(true)}
                className="text-xs text-gray-400 hover:text-red-600 transition-colors"
              >
                Start week from scratch…
              </button>
            )}
            {!done && resetConfirm && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600 hidden sm:inline">
                  Reset this week&apos;s planning ({plannedCount} block{plannedCount === 1 ? '' : 's'})? Upcoming
                  ones are removed from your calendar; past blocks and meetings are left untouched.
                </span>
                <button
                  onClick={resetWeek}
                  disabled={isResetting}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors flex-shrink-0"
                >
                  {isResetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Reset week
                </button>
                <button
                  onClick={() => setResetConfirm(false)}
                  disabled={isResetting}
                  className="text-xs text-gray-500 hover:text-gray-700 flex-shrink-0"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Right: apply / close */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {done ? (
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
                  Cancel
                </button>
                {data && (data.moves.length > 0 || stale.length > 0 || additions.length > 0) && (
                  <button
                    onClick={confirm}
                    disabled={isLoading || isConfirming || actionCount === 0}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isConfirming && <Loader2 className="w-4 h-4 animate-spin" />}
                    Apply {actionCount > 0 ? actionCount : ''} change{actionCount === 1 ? '' : 's'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
