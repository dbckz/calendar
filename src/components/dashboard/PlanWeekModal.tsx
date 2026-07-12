'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, CalendarClock, Loader2, Check, AlertTriangle } from 'lucide-react';
import { format, parseISO } from 'date-fns';

import { api, type ProposeWeekResponse, type QuotaSummaryRow, type ConfirmWeekResult } from '@/lib/api';
import type { ProposedBlock } from '@/lib/scheduling/types';

interface PlanWeekModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplied?: () => void; // called after a successful confirm so the caller can refresh
}

// Deterministic pastel-ish colour per category, so a category always reads the
// same across the modal.
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

function timeRange(start: string, durationMinutes: number): string {
  const [h, m] = start.split(':').map(Number);
  const startDate = new Date(2000, 0, 1, h, m);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
  return `${start}–${format(endDate, 'HH:mm')}`;
}

interface EditableProposal extends ProposedBlock {
  accepted: boolean;
}

export function PlanWeekModal({ isOpen, onClose, onApplied }: PlanWeekModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<EditableProposal[]>([]);
  const [quotaSummary, setQuotaSummary] = useState<QuotaSummaryRow[]>([]);
  const [weekLabel, setWeekLabel] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [results, setResults] = useState<Record<string, ConfirmWeekResult>>({});

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setResults({});
    try {
      const data: ProposeWeekResponse = await api.proposeWeeklyPlan();
      setProposals(data.proposals.map(p => ({ ...p, accepted: true })));
      setQuotaSummary(data.quotaSummary);
      setWeekLabel(`${format(parseISO(data.weekStart), 'MMM d')} – ${format(parseISO(data.weekEnd), 'MMM d')}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load proposals');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Group proposals by date.
  const grouped = useMemo(() => {
    const map = new Map<string, EditableProposal[]>();
    for (const p of proposals) {
      const list = map.get(p.date) ?? [];
      list.push(p);
      map.set(p.date, list);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, items]) => ({
        date,
        items: items.sort((a, b) => (a.start < b.start ? -1 : 1)),
      }));
  }, [proposals]);

  const acceptedCount = proposals.filter(p => p.accepted).length;

  const toggleAccept = (id: string) =>
    setProposals(prev => prev.map(p => (p.id === id ? { ...p, accepted: !p.accepted } : p)));

  const editStart = (id: string, start: string) =>
    setProposals(prev => prev.map(p => (p.id === id ? { ...p, start } : p)));

  const confirm = useCallback(async () => {
    const accepted = proposals.filter(p => p.accepted);
    if (accepted.length === 0) return;
    setIsConfirming(true);
    setError(null);
    try {
      const blocks: ProposedBlock[] = accepted.map(p => ({
        id: p.id,
        category: p.category,
        task: p.task,
        date: p.date,
        start: p.start,
        durationMinutes: p.durationMinutes,
        reason: p.reason,
      }));
      const { results: res } = await api.confirmWeeklyPlan(blocks);
      const map: Record<string, ConfirmWeekResult> = {};
      for (const r of res) map[r.id] = r;
      setResults(map);
      if (res.some(r => r.success)) onApplied?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm plan');
    } finally {
      setIsConfirming(false);
    }
  }, [proposals, onApplied]);

  if (!isOpen) return null;

  const hasResults = Object.keys(results).length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-orange-500" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Plan my week</h2>
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
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          ) : proposals.length === 0 ? (
            <p className="text-sm text-gray-400 italic py-8 text-center">
              Nothing to schedule — quotas are already met or no free time is available this week.
            </p>
          ) : (
            <>
              {/* Unmet-quota summary */}
              {quotaSummary.some(q => q.unmet > 0) && (
                <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs font-medium text-amber-800 mb-1">Quota not fully met</p>
                  <ul className="text-xs text-amber-700 space-y-0.5">
                    {quotaSummary
                      .filter(q => q.unmet > 0)
                      .map(q => (
                        <li key={q.category}>
                          {q.category}: {q.existing + q.proposed}/{q.weeklyCount} scheduled ({q.unmet} short)
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
                        const color = categoryColor(p.category);
                        const result = results[p.id];
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
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${color.bg} ${color.text}`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                                  {p.category}
                                </span>
                                <span
                                  className="text-sm font-medium text-gray-800 truncate"
                                  title={p.reason}
                                >
                                  {p.task ? p.task.title : 'Reserved'}
                                </span>
                              </div>
                            </div>
                            <input
                              type="time"
                              value={p.start}
                              onChange={e => editStart(p.id, e.target.value)}
                              disabled={hasResults}
                              className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                              title={timeRange(p.start, p.durationMinutes)}
                            />
                            {result && (
                              result.success ? (
                                <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                              ) : (
                                <AlertTriangle
                                  className="w-4 h-4 text-red-500 flex-shrink-0"
                                  aria-label={result.error}
                                />
                              )
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200">
          <span className="text-xs text-gray-400">
            {acceptedCount} of {proposals.length} block{proposals.length === 1 ? '' : 's'} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {hasResults ? 'Done' : 'Cancel'}
            </button>
            {!hasResults && (
              <button
                onClick={confirm}
                disabled={acceptedCount === 0 || isConfirming || isLoading}
                className="px-4 py-2 text-sm font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isConfirming && <Loader2 className="w-4 h-4 animate-spin" />}
                Add {acceptedCount > 0 ? acceptedCount : ''} to calendar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
