'use client';

import { useMemo, useState } from 'react';
import { format, parseISO, differenceInCalendarDays, addDays, addWeeks, nextMonday } from 'date-fns';
import { CalendarEventResponse } from '@/types';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/useToast';

interface OverdueDatesViewProps {
  tasks: CalendarEventResponse[];
}

const todayStr = () => format(new Date(), 'yyyy-MM-dd');

export function OverdueDatesView({ tasks }: OverdueDatesViewProps) {
  const toast = useToast();
  const today = todayStr();

  // All incomplete tasks with a due date in the past, most-overdue first.
  const overdue = useMemo(
    () =>
      tasks
        .filter(t => t.dueOn && t.dueOn < today)
        .sort((a, b) => (a.dueOn! < b.dueOn! ? -1 : a.dueOn! > b.dueOn! ? 1 : 0)),
    [tasks, today]
  );

  // Per-row chosen date, defaulting to today. Rows are hidden once saved.
  const [dates, setDates] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);

  const remaining = overdue.filter(t => !saved.has(t.id));

  const dateFor = (id: string) => dates[id] ?? today;

  const setDate = (id: string, value: string) =>
    setDates(prev => ({ ...prev, [id]: value }));

  const handleSave = async (task: CalendarEventResponse) => {
    const dueOn = dateFor(task.id);
    setSavingId(task.id);
    // Optimistic: hide the row immediately, restore on failure.
    setSaved(prev => new Set(prev).add(task.id));
    try {
      await api.updateAsanaTask(task.id, task.integrationId, { dueOn });
      toast.success(`Rescheduled to ${format(parseISO(dueOn), 'EEE d MMM')}`);
    } catch (err) {
      setSaved(prev => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
      toast.error(err instanceof Error ? err.message : 'Failed to update due date');
    } finally {
      setSavingId(null);
    }
  };

  if (remaining.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-4xl mb-3">📅</p>
        <p className="text-gray-700 font-medium">No overdue dates.</p>
        <p className="text-sm text-gray-500 mt-1">Every incomplete task with a due date is in the future.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <p className="text-sm text-gray-600">
        {remaining.length} task{remaining.length === 1 ? '' : 's'} with an overdue due date. Give each a realistic new date.
      </p>

      <div className="space-y-2">
        {overdue
          .filter(t => !saved.has(t.id))
          .map(task => {
            const daysOver = differenceInCalendarDays(parseISO(today), parseISO(task.dueOn!));
            return (
              <div
                key={task.id}
                className="flex flex-wrap items-center gap-3 bg-white border border-gray-200 rounded-lg p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                  <p className="text-xs text-gray-500">
                    {task.integrationName} · due {format(parseISO(task.dueOn!), 'd MMM yyyy')}{' '}
                    <span className="text-red-600 font-medium">{daysOver}d overdue</span>
                  </p>
                </div>

                <input
                  type="date"
                  value={dateFor(task.id)}
                  onChange={e => setDate(task.id, e.target.value)}
                  className="px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                />

                <div className="flex gap-1">
                  <QuickBtn label="+1d" onClick={() => setDate(task.id, format(addDays(new Date(), 1), 'yyyy-MM-dd'))} />
                  <QuickBtn label="+1w" onClick={() => setDate(task.id, format(addWeeks(new Date(), 1), 'yyyy-MM-dd'))} />
                  <QuickBtn label="next Mon" onClick={() => setDate(task.id, format(nextMonday(new Date()), 'yyyy-MM-dd'))} />
                </div>

                <button
                  onClick={() => handleSave(task)}
                  disabled={savingId === task.id}
                  className="px-3 py-1 text-sm font-medium bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function QuickBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
    >
      {label}
    </button>
  );
}
