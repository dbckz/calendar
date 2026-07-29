'use client';

import { useMemo } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Reminder } from '@/types';

export function RemindersTab({
  reminders,
  updatingIds,
  hasUndo,
  error,
  onComplete,
  onUndo,
}: {
  reminders: Reminder[];
  updatingIds: Set<string>;
  hasUndo: boolean;
  error: string | null;
  onComplete: (reminder: Reminder) => void;
  onUndo: () => void;
}) {
  const activeReminders = useMemo(
    () => reminders.filter(reminder => !reminder.completed),
    [reminders]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Reminders</h2>
        <span className="text-sm text-gray-500">{activeReminders.length}</span>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {hasUndo && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          <span className="min-w-0">
            Reminder completed. Press Cmd/Ctrl+Z to undo.
          </span>
          <button
            type="button"
            onClick={onUndo}
            className="flex-shrink-0 rounded px-2 py-1 font-medium text-blue-700 hover:bg-blue-100"
          >
            Undo
          </button>
        </div>
      )}

      {activeReminders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-10 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-gray-400" />
          <p className="mt-3 text-sm font-medium text-gray-700">No active reminders</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
          <div className="space-y-3">
            {activeReminders.map(reminder => (
              <div key={reminder.id} className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => onComplete(reminder)}
                  disabled={updatingIds.has(reminder.id)}
                  className="mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-emerald-600 transition-colors hover:bg-emerald-50 disabled:opacity-50"
                  aria-label={`Mark ${reminder.text} done`}
                >
                  {updatingIds.has(reminder.id) ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5" />
                  )}
                </button>
                <div className="min-w-0 flex-1 py-2.5">
                  <p className="text-sm leading-6 text-gray-800">{reminder.text}</p>
                  {reminder.due && (
                    <p className="mt-0.5 text-xs text-gray-500">Due {reminder.due}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
