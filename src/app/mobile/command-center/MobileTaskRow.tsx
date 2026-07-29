'use client';

import { ReactNode } from 'react';
import { format, parseISO, isPast, isToday } from 'date-fns';
import { Calendar } from 'lucide-react';
import { CalendarEvent } from '@/types';

function dueColor(dueOn?: string): string {
  if (!dueOn) return 'text-gray-400';
  const date = parseISO(dueOn);
  if (isPast(date) && !isToday(date)) return 'text-red-500';
  if (isToday(date)) return 'text-orange-500';
  return 'text-gray-500';
}

// A touch-sized task row (≥44px) for the mobile Command Center lists.
export function MobileTaskRow({
  task,
  onClick,
  action,
}: {
  task: CalendarEvent;
  onClick?: () => void;
  action?: ReactNode;
}) {
  return (
    <li className="flex min-h-11 items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className="flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-lg px-2 py-1.5 text-left transition-colors active:bg-gray-50"
      >
        <p className="w-full truncate text-sm font-medium leading-tight text-gray-900">{task.title}</p>
        <span className="flex items-center gap-2">
          <span className={`flex items-center gap-1 text-[11px] ${dueColor(task.dueOn)}`}>
            <Calendar className="h-3 w-3" />
            {task.dueOn ? format(parseISO(task.dueOn), 'dd MMM') : 'No due date'}
          </span>
          {task.integrationName && (
            <span className="truncate text-[11px] text-gray-400">{task.integrationName}</span>
          )}
        </span>
      </button>
      {action}
    </li>
  );
}
