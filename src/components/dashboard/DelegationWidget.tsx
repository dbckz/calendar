'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarEvent, OrchestratorStatus } from '@/types';
import { api } from '@/lib/api';
import { Bot, CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';

interface DelegationWidgetProps {
  tasks: CalendarEvent[]; // incomplete Asana tasks (carry `tags`)
  onTaskClick?: (taskId: string) => void;
}

const STATUS_REFRESH_MS = 30_000;

function taskHasTag(task: CalendarEvent, tag: string): boolean {
  return (task.tags || []).some(t => t.name.toLowerCase() === tag);
}

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

export function DelegationWidget({ tasks, onTaskClick }: DelegationWidgetProps) {
  const [status, setStatus] = useState<OrchestratorStatus | null>(null);

  // Poll the orchestrator status file while the dashboard is mounted/visible.
  useEffect(() => {
    let cancelled = false;

    const load = () => {
      api.getOrchestratorStatus()
        .then(s => { if (!cancelled) setStatus(s); })
        .catch(() => { /* keep last known status on transient errors */ });
    };

    load();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, STATUS_REFRESH_MS);

    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const queued = useMemo(
    () => tasks.filter(t => !t.completed && taskHasTag(t, 'agent_ready')),
    [tasks]
  );

  const running = status?.running && status.currentTask ? status.currentTask : null;
  const runningSince = status?.running?.startedAt;
  const history = status?.history ?? [];

  const isEmpty = queued.length === 0 && !running && history.length === 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Bot className="w-5 h-5 text-indigo-600" />
        <h2 className="text-lg font-semibold text-gray-900">Delegation</h2>
      </div>

      {isEmpty ? (
        <p className="text-sm text-gray-400 italic">No delegated tasks in flight.</p>
      ) : (
        <div className="space-y-4">
          {/* Running */}
          {running && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Loader2 className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                <span className="text-sm font-medium text-amber-600">Running</span>
              </div>
              <div
                onClick={() => onTaskClick?.(running.gid)}
                className={`text-sm text-gray-800 px-2 py-1 rounded bg-amber-50 ${onTaskClick ? 'cursor-pointer hover:bg-amber-100' : ''}`}
              >
                <span className="truncate block">{running.title}</span>
                {runningSince && (
                  <span className="text-xs text-amber-700/70 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" /> started {relativeTime(runningSince)}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Queued */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-blue-600">Queued</span>
              <span className="text-xs text-gray-400">{queued.length}</span>
            </div>
            {queued.length > 0 ? (
              <ul className="space-y-0.5">
                {queued.map(task => (
                  <li
                    key={task.id}
                    onClick={() => onTaskClick?.(task.id)}
                    className={`text-sm text-gray-700 truncate px-2 py-1 rounded ${onTaskClick ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                  >
                    {task.title}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-400 italic px-2">Nothing queued.</p>
            )}
          </div>

          {/* Recent */}
          {history.length > 0 && (
            <div>
              <span className="text-sm font-medium text-gray-600">Recent</span>
              <ul className="mt-1 space-y-1.5">
                {history.slice(0, 5).map((entry, i) => {
                  const ok = entry.finalStatus === 'successful';
                  return (
                    <li
                      key={`${entry.taskGid ?? 'run'}-${entry.ranAt}-${i}`}
                      onClick={() => entry.taskGid && onTaskClick?.(entry.taskGid)}
                      className={`flex items-start gap-1.5 px-2 py-1 rounded ${entry.taskGid && onTaskClick ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                    >
                      {ok ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm text-gray-700 truncate">{entry.title || 'Run'}</span>
                          <span className="text-xs text-gray-400 flex-shrink-0">{relativeTime(entry.ranAt)}</span>
                        </div>
                        {entry.summary && (
                          <p className="text-xs text-gray-500 line-clamp-2">{entry.summary}</p>
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
