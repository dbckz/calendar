'use client';

import { useEffect, useMemo, useState } from 'react';
import { DelegationQueueEntry, OrchestratorStatus } from '@/types';
import { api } from '@/lib/api';
import { Bot, CheckCircle2, XCircle, Loader2, Clock, PauseCircle, Check, UserRound, Zap } from 'lucide-react';

interface DelegationWidgetProps {
  // The delegation queue is owned by the page-level useDelegationQueue store and
  // passed in, so a delegate action (which refreshes that store) shows here at
  // once instead of waiting for a separate widget-local poll.
  delegationByGid: Record<string, DelegationQueueEntry>;
  onTaskClick?: (taskId: string) => void;
  // Triage actions for a finished (done/failed) run in the "For review" inbox.
  // Each marks the entry reviewed (server-side) so it leaves the list, and
  // refreshes the shared store. Wired from page.tsx.
  onReviewDone?: (entry: DelegationQueueEntry) => void;        // complete the Asana task
  onReviewNeedsHuman?: (entry: DelegationQueueEntry) => void;  // clear aiDelegable, keep task open
  onReviewContinue?: (entry: DelegationQueueEntry) => void;    // open the compose-brief modal
}

const REFRESH_MS = 30_000;

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function isFuture(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t > Date.now();
}

function timeUntil(iso: string): string {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return '';
  const mins = Math.round((target - Date.now()) / 60_000);
  if (mins <= 0) return 'shortly';
  if (mins < 60) return `${mins}m`;
  return `${Math.round(mins / 60)}h`;
}

export function DelegationWidget({
  delegationByGid,
  onTaskClick,
  onReviewDone,
  onReviewNeedsHuman,
  onReviewContinue,
}: DelegationWidgetProps) {
  // The queue entries come from the page-level store (prop). Only the
  // orchestrator status (pacer pause) is polled locally here — it's separate
  // data the delegation store doesn't carry.
  const [status, setStatus] = useState<OrchestratorStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api.getOrchestratorStatus()
        .then(s => { if (!cancelled) setStatus(s); })
        .catch(() => { /* keep last known state on transient errors */ });
    };
    load();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const list = useMemo(() => Object.values(delegationByGid), [delegationByGid]);
  const running = useMemo(() => list.filter(e => e.state === 'running'), [list]);
  const queued = useMemo(
    () => list.filter(e => e.state === 'queued').sort((a, b) => a.enqueuedAt.localeCompare(b.enqueuedAt)),
    [list]
  );
  // Finished runs the user hasn't triaged yet form the "For review" inbox.
  // Old finished entries predating reviewedAt (no reviewedAt) still show up.
  const forReview = useMemo(
    () => list
      .filter(e => (e.state === 'done' || e.state === 'failed') && !e.reviewedAt)
      .sort((a, b) => (b.result?.finishedAt || b.updatedAt).localeCompare(a.result?.finishedAt || a.updatedAt)),
    [list]
  );

  const pausedUntil = isFuture(status?.pausedUntil) ? status!.pausedUntil! : null;

  const isEmpty = running.length === 0 && queued.length === 0 && forReview.length === 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 h-full flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-2 flex-shrink-0">
        <Bot className="w-4 h-4 text-indigo-600" />
        <h2 className="text-base font-semibold text-gray-900">Delegation</h2>
      </div>

      {pausedUntil && (
        <div className="flex items-center gap-1.5 mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 flex-shrink-0">
          <PauseCircle className="w-3.5 h-3.5" /> Paced — paused for {timeUntil(pausedUntil)} (usage limit)
        </div>
      )}

      {isEmpty ? (
        <p className="text-sm text-gray-400 italic">No delegated tasks in flight.</p>
      ) : (
        <div className="space-y-4 overflow-y-auto flex-1 min-h-0">
          {running.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Loader2 className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                <span className="text-sm font-medium text-amber-600">Running</span>
              </div>
              <ul className="space-y-0.5">
                {running.map(e => (
                  <li
                    key={e.asanaTaskGid}
                    onClick={() => onTaskClick?.(e.asanaTaskGid)}
                    className={`text-sm text-gray-800 px-2 py-1 rounded bg-amber-50 ${onTaskClick ? 'cursor-pointer hover:bg-amber-100' : ''}`}
                  >
                    <span className="truncate block">{e.title || 'Task'}</span>
                    {e.startedAt && (
                      <span className="text-xs text-amber-700/70 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" /> started {relativeTime(e.startedAt)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-blue-600">Queued</span>
              <span className="text-xs text-gray-400">{queued.length}</span>
            </div>
            {queued.length > 0 ? (
              <ul className="space-y-0.5">
                {queued.map(e => (
                  <li
                    key={e.asanaTaskGid}
                    onClick={() => onTaskClick?.(e.asanaTaskGid)}
                    className={`text-sm text-gray-700 truncate px-2 py-1 rounded ${onTaskClick ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                  >
                    {e.title || 'Task'}
                    {e.mode === 'now' && <span className="ml-1.5 text-xs text-indigo-500">run now</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-400 italic px-2">Nothing queued.</p>
            )}
          </div>

          {forReview.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-600">For review</span>
                <span className="text-xs text-gray-400">{forReview.length}</span>
              </div>
              <ul className="space-y-1.5">
                {forReview.map(e => {
                  const ok = e.state === 'done' && e.result?.status !== 'failed';
                  return (
                    <li
                      key={e.asanaTaskGid}
                      className="px-2 py-1.5 rounded bg-gray-50/60 border border-gray-100"
                    >
                      <div
                        onClick={() => onTaskClick?.(e.asanaTaskGid)}
                        className={`flex items-start gap-1.5 ${onTaskClick ? 'cursor-pointer' : ''}`}
                      >
                        {ok ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm text-gray-700 truncate">{e.title || 'Task'}</span>
                            <span className="text-xs text-gray-400 flex-shrink-0">{relativeTime(e.result?.finishedAt || e.updatedAt)}</span>
                          </div>
                          {e.result?.summary && (
                            <p className="text-xs text-gray-500 line-clamp-2">{e.result.summary}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 mt-1.5 pl-5">
                        <button
                          onClick={(ev) => { ev.stopPropagation(); onReviewDone?.(e); }}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors"
                          title="Mark the Asana task complete and clear from review"
                        >
                          <Check className="w-3 h-3" /> Done
                        </button>
                        <button
                          onClick={(ev) => { ev.stopPropagation(); onReviewNeedsHuman?.(e); }}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] rounded border border-amber-200 text-amber-700 hover:bg-amber-50 transition-colors"
                          title="Needs a human — keep the task open and stop suggesting it for AI"
                        >
                          <UserRound className="w-3 h-3" /> Needs human
                        </button>
                        <button
                          onClick={(ev) => { ev.stopPropagation(); onReviewContinue?.(e); }}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] rounded border border-indigo-200 text-indigo-700 hover:bg-indigo-50 transition-colors"
                          title="Continue with AI — send a follow-up brief"
                        >
                          <Zap className="w-3 h-3" /> Continue with AI
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
