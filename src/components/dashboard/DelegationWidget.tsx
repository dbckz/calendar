'use client';

import { useEffect, useMemo, useState } from 'react';
import { DelegationQueueEntry, OrchestratorStatus } from '@/types';
import { api } from '@/lib/api';
import { Bot, CheckCircle2, XCircle, Loader2, Clock, PauseCircle } from 'lucide-react';

interface DelegationWidgetProps {
  // The delegation queue is owned by the page-level useDelegationQueue store and
  // passed in, so a delegate action (which refreshes that store) shows here at
  // once instead of waiting for a separate widget-local poll.
  delegationByGid: Record<string, DelegationQueueEntry>;
  onTaskClick?: (taskId: string) => void;
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

export function DelegationWidget({ delegationByGid, onTaskClick }: DelegationWidgetProps) {
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
  const recent = useMemo(
    () => list
      .filter(e => e.state === 'done' || e.state === 'failed')
      .sort((a, b) => (b.result?.finishedAt || b.updatedAt).localeCompare(a.result?.finishedAt || a.updatedAt))
      .slice(0, 5),
    [list]
  );

  const pausedUntil = isFuture(status?.pausedUntil) ? status!.pausedUntil! : null;

  const isEmpty = running.length === 0 && queued.length === 0 && recent.length === 0;

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

          {recent.length > 0 && (
            <div>
              <span className="text-sm font-medium text-gray-600">Recent</span>
              <ul className="mt-1 space-y-1.5">
                {recent.map(e => {
                  const ok = e.state === 'done' && e.result?.status !== 'failed';
                  return (
                    <li
                      key={e.asanaTaskGid}
                      onClick={() => onTaskClick?.(e.asanaTaskGid)}
                      className={`flex items-start gap-1.5 px-2 py-1 rounded ${onTaskClick ? 'cursor-pointer hover:bg-gray-50' : ''}`}
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
