'use client';

import { useEffect, useState } from 'react';
import { Bot, X, Loader2, Check, AlertTriangle, Calendar } from 'lucide-react';
import { format, parseISO } from 'date-fns';

import { api, type AiClaim } from '@/lib/api';

interface AiClaimsModalProps {
  isOpen: boolean;
  // The NEW claims from the assessment (already filtered server-side: nothing
  // already accepted, nothing Dave has ruled out). Empty → the empty state.
  claims: AiClaim[];
  onClose: () => void;
  onApplied?: () => void; // called after a successful confirm so the caller can refresh
}

// Review gate for the manual "Assess AI-runnable" run. Every new claim is ticked
// by default: confirming accepts the ticked ones into the AI-runnable list and
// records the unticked ones as "not AI-runnable" so they are never re-claimed.
// Closing or cancelling applies nothing at all.
export function AiClaimsModal({ isOpen, claims, onClose, onApplied }: AiClaimsModalProps) {
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default every claim to accepted on each fresh open.
  useEffect(() => {
    if (!isOpen) return;
    setAccepted(new Set(claims.map(c => c.gid)));
    setIsSaving(false);
    setError(null);
  }, [isOpen, claims]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggle = (gid: string) =>
    setAccepted(prev => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid);
      else next.add(gid);
      return next;
    });

  const confirm = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await api.applyAiVerdicts(
        claims.filter(c => accepted.has(c.gid)).map(c => ({ gid: c.gid, integrationId: c.integrationId })),
        claims.filter(c => !accepted.has(c.gid)).map(c => ({ gid: c.gid, integrationId: c.integrationId }))
      );
      onApplied?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save your decisions');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-indigo-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">New AI-runnable tasks</h2>
              <p className="text-xs text-gray-400">
                {claims.length > 0
                  ? 'Untick anything an agent shouldn’t run — those are remembered and never suggested again.'
                  : 'Nothing new to review.'}
              </p>
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

          {claims.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
              <Check className="w-8 h-8 text-emerald-500" />
              <p className="text-sm font-medium text-gray-700">No new AI-runnable tasks found.</p>
              <p className="text-xs text-gray-400">
                Everything the assessor flagged is already in your list or already ruled out.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {claims.map(claim => {
                const isIn = accepted.has(claim.gid);
                return (
                  <li
                    key={claim.gid}
                    className={`flex items-start gap-3 rounded-lg border p-3 ${
                      isIn ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isIn}
                      onChange={() => toggle(claim.gid)}
                      disabled={isSaving}
                      aria-label={`AI-runnable: ${claim.title}`}
                      className="mt-1 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-gray-800 truncate">{claim.title}</span>
                        {claim.integrationName && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-gray-100 text-gray-500 flex-shrink-0">
                            {claim.integrationName}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                        <span className="flex items-center gap-1 text-gray-400">
                          <Calendar className="w-3 h-3" />
                          {claim.dueOn ? format(parseISO(claim.dueOn), 'dd MMM') : 'No due date'}
                        </span>
                      </div>
                      {claim.reason && (
                        <p className="mt-1 text-xs text-gray-400 line-clamp-2">{claim.reason}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200">
          {claims.length === 0 ? (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={isSaving}
                className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirm}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
