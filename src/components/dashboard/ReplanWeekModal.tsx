'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, RefreshCw, Loader2, Check, AlertTriangle, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';

import { api, type ReplanAnalyzeResponse } from '@/lib/api';
import { ReplanSections, replanHasWork } from './ReplanSections';
import { useReplanActions } from './useReplanActions';

interface ReplanWeekModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplied?: () => void; // called after a successful confirm so the caller can refresh
  // Called after "Start week from scratch" resets the week, so the caller can
  // close this modal and open the Plan-week wizard (with fresh calendar data).
  onStartFromScratch?: () => void;
}

export function ReplanWeekModal({ isOpen, onClose, onApplied, onStartFromScratch }: ReplanWeekModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReplanAnalyzeResponse | null>(null);
  // "Start week from scratch" inline confirm + progress.
  const [resetConfirm, setResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const actions = useReplanActions(data, onApplied);

  const analyze = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.analyzeReplan();
      setData(res);
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
    setError(null);
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
    (data?.kept.length ?? 0) + (data?.moves.length ?? 0) + (data?.stale?.length ?? 0) + (data?.unplaceable.length ?? 0);

  const nothingToDo = data && !replanHasWork(data);
  const displayError = error ?? actions.error;

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
          {displayError && (
            <div className="mb-4 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{displayError}</span>
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
            <ReplanSections data={data} actions={actions} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-gray-200">
          {/* Left: start-from-scratch destructive action / inline confirm */}
          <div className="min-w-0">
            {!actions.done && data && !resetConfirm && (
              <button
                onClick={() => setResetConfirm(true)}
                className="text-xs text-gray-400 hover:text-red-600 transition-colors"
              >
                Start week from scratch…
              </button>
            )}
            {!actions.done && resetConfirm && (
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
            {actions.done ? (
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
                {data && replanHasWork(data) && (
                  <button
                    onClick={actions.confirm}
                    disabled={isLoading || actions.isConfirming || actions.actionCount === 0}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {actions.isConfirming && <Loader2 className="w-4 h-4 animate-spin" />}
                    Apply {actions.actionCount > 0 ? actions.actionCount : ''} change{actions.actionCount === 1 ? '' : 's'}
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
