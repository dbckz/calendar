'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, RefreshCw, Loader2, Check, AlertTriangle, ArrowRight, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';

import { api, type ReplanAnalyzeResponse, type ReplanConfirmResult } from '@/lib/api';

interface ReplanWeekModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplied?: () => void; // called after a successful confirm so the caller can refresh
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

export function ReplanWeekModal({ isOpen, onClose, onApplied }: ReplanWeekModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReplanAnalyzeResponse | null>(null);
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [results, setResults] = useState<Record<string, ReplanConfirmResult>>({});
  const [done, setDone] = useState(false);

  const analyze = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setResults({});
    setDone(false);
    try {
      const res = await api.analyzeReplan();
      setData(res);
      // Default: every proposed move is included.
      setIncluded(new Set(res.moves.map(m => m.googleEventId)));
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
    setShowUnchanged(false);
    setIsConfirming(false);
    setResults({});
    setDone(false);
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

  const hasResults = Object.keys(results).length > 0;
  const includedCount = data ? data.moves.filter(m => included.has(m.googleEventId)).length : 0;

  const toggle = (id: string) =>
    setIncluded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirm = useCallback(async () => {
    if (!data) return;
    const moves = data.moves
      .filter(m => included.has(m.googleEventId))
      .map(m => ({
        googleEventId: m.googleEventId,
        googleIntegrationId: m.googleIntegrationId,
        date: m.newDate,
        start: m.newStart,
        durationMinutes: m.durationMinutes,
      }));
    if (moves.length === 0) return;
    setIsConfirming(true);
    setError(null);
    try {
      const { results: res } = await api.confirmReplan(moves);
      const map: Record<string, ReplanConfirmResult> = {};
      for (const r of res) map[r.googleEventId] = r;
      setResults(map);
      if (res.some(r => r.success)) onApplied?.();
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply changes');
    } finally {
      setIsConfirming(false);
    }
  }, [data, included, onApplied]);

  if (!isOpen) return null;

  const nothingToDo =
    data && data.moves.length === 0 && data.unplaceable.length === 0;

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
                                  m.reason === 'missed'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}
                              >
                                {m.reason === 'missed' ? 'missed' : 'conflict'}
                              </span>
                              <span className="text-sm font-medium text-gray-800 truncate">
                                {titleLabel(m.titles)}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                              <span className="line-through">{slotLabel(m.oldDate, m.oldStart)}</span>
                              <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                              <span className="font-medium text-slate-600">
                                {slotLabel(m.newDate, m.newStart)}
                              </span>
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
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200">
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
              {data && data.moves.length > 0 && (
                <button
                  onClick={confirm}
                  disabled={isLoading || isConfirming || includedCount === 0}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isConfirming && <Loader2 className="w-4 h-4 animate-spin" />}
                  Apply {includedCount > 0 ? includedCount : ''} move{includedCount === 1 ? '' : 's'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
