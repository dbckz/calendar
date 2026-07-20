'use client';

import { useEffect, useState, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { X, Trash2, Loader2, CheckCircle2, Archive } from 'lucide-react';
import { CalendarEvent } from '@/types';
import { api } from '@/lib/api';

interface StaleTasksModalProps {
  tasks: CalendarEvent[]; // incomplete Asana tasks
  onClose: () => void;
  onOpenTask?: (taskId: string) => void;
  onDeleteTask?: (taskId: string, integrationId: string) => void; // optimistic delete in parent
  // A task-detail dialog is open on top of this modal; ignore Escape / backdrop
  // so those only dismiss the dialog, leaving this triage list untouched.
  childDialogOpen?: boolean;
}

interface StaleRow {
  task: CalendarEvent;
  reason: string;
}

function fmt(iso?: string): string {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'dd MMM yyyy'); } catch { return '—'; }
}

// Review panel for the "Triage stale" action: runs the (cached) staleness
// classifier over incomplete tasks, then lets you Delete or Keep-active each
// flagged task. "Keep active" snoozes it out of the list for a period; both
// actions are remembered server-side so re-triaging won't re-surface them.
export function StaleTasksModal({ tasks, onClose, onOpenTask, onDeleteTask, childDialogOpen }: StaleTasksModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<StaleRow[]>([]);
  const [busyGid, setBusyGid] = useState<string | null>(null);
  const [confirmGid, setConfirmGid] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !childDialogOpen) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, childDialogOpen]);

  useEffect(() => {
    let cancelled = false;
    const byId = new Map(tasks.map(t => [t.id, t]));
    const payload = tasks
      .filter(t => !t.completed && t.integrationId)
      .map(t => ({
        gid: t.id,
        integrationId: t.integrationId as string,
        title: t.title,
        description: t.description,
        createdAt: t.createdAt,
        dueOn: t.dueOn,
        startOn: t.startOn,
        integrationName: t.integrationName,
      }));

    api.triageStaleTasks(payload)
      .then(({ staleTasks }) => {
        if (cancelled) return;
        setRows(staleTasks
          .map(s => ({ task: byId.get(s.gid), reason: s.reason }))
          .filter((r): r is StaleRow => Boolean(r.task)));
      })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Triage failed.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tasks]);

  const removeRow = useCallback((gid: string) => setRows(prev => prev.filter(r => r.task.id !== gid)), []);

  const handleKeep = async (task: CalendarEvent) => {
    setBusyGid(task.id);
    try {
      await api.keepTaskActive(task.id);
      removeRow(task.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to keep task.');
    } finally {
      setBusyGid(null);
    }
  };

  const handleDelete = async (task: CalendarEvent) => {
    if (confirmGid !== task.id) { setConfirmGid(task.id); return; }
    if (!task.integrationId) return;
    setBusyGid(task.id);
    try {
      if (onDeleteTask) onDeleteTask(task.id, task.integrationId);
      else await api.deleteAsanaTask(task.id, task.integrationId);
      removeRow(task.id);
      setConfirmGid(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete task.');
    } finally {
      setBusyGid(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={childDialogOpen ? undefined : onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Archive className="w-5 h-5 text-amber-600" /> Possibly stale tasks
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 min-h-0">
          {error && (
            <div className="p-3 mb-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Reviewing your tasks for stale ones…
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-gray-500">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              Nothing looks stale. You&apos;re all clear.
            </div>
          ) : (
            <ul className="space-y-2">
              {rows.map(({ task, reason }) => {
                const busy = busyGid === task.id;
                const confirming = confirmGid === task.id;
                return (
                  <li key={task.id} className="border border-gray-200 rounded-lg p-3 flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <button
                        onClick={() => onOpenTask?.(task.id)}
                        className={`text-sm font-medium text-gray-900 text-left ${onOpenTask ? 'hover:text-indigo-600' : ''}`}
                      >
                        {task.title}
                      </button>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {task.integrationName && <span className="mr-2">{task.integrationName}</span>}
                        created {fmt(task.createdAt)} · due {task.dueOn ? fmt(task.dueOn) : 'none'}
                      </p>
                      <p className="text-xs text-amber-700 italic mt-1">{reason}</p>
                    </div>
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleKeep(task)}
                        disabled={busy}
                        className="flex items-center justify-center gap-1 px-2.5 py-1 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Keep active
                      </button>
                      <button
                        onClick={() => handleDelete(task)}
                        disabled={busy}
                        className={`flex items-center justify-center gap-1 px-2.5 py-1 text-xs rounded-md text-white disabled:opacity-50 ${confirming ? 'bg-red-700 hover:bg-red-800' : 'bg-red-600 hover:bg-red-700'}`}
                      >
                        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        {confirming ? 'Confirm delete' : 'Delete'}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-4 py-2.5 border-t border-gray-100 text-xs text-gray-400 flex-shrink-0">
          Results are cached; “Keep active” hides a task here for ~90 days. Delete moves it to Asana’s trash.
        </div>
      </div>
    </div>
  );
}
