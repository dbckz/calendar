'use client';

import { useEffect, type ReactNode } from 'react';
import { format, parseISO, isPast, isToday } from 'date-fns';
import { Calendar, X } from 'lucide-react';
import { CalendarEvent } from '@/types';

interface ExpandedTasksModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  tasks: CalendarEvent[]; // the full list, not just the card's page
  onTaskClick?: (taskId: string, navIds?: string[]) => void;
  // Per-row trailing slot: badges on the left card, a Delegate button on the AI one.
  renderAction?: (task: CalendarEvent) => ReactNode;
}

function dueColor(dueOn?: string): string {
  if (!dueOn) return 'text-gray-400';
  const date = parseISO(dueOn);
  if (isPast(date) && !isToday(date)) return 'text-red-500';
  if (isToday(date)) return 'text-orange-500';
  return 'text-gray-500';
}

// Full-screen view of a task card's entire list, laid out in dense columns so as
// many rows as possible are visible at once. Rows keep the card's affordances.
export function ExpandedTasksModal({
  isOpen,
  onClose,
  title,
  icon,
  tasks,
  onTaskClick,
  renderAction,
}: ExpandedTasksModalProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const navIds = tasks.map(t => t.id);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-[90vw] h-[90vh] max-w-none flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            {icon}
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            {tasks.length > 0 && <span className="text-sm text-gray-400">{tasks.length}</span>}
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
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          {tasks.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No tasks to show.</p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-0.5">
              {tasks.map(task => (
                <li
                  key={task.id}
                  onClick={() => onTaskClick?.(task.id, navIds)}
                  className={`group flex items-center gap-2 px-2 py-1 rounded-lg ${
                    onTaskClick ? 'cursor-pointer hover:bg-gray-50' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate leading-tight">{task.title}</p>
                    <div className="flex items-center gap-2">
                      <span className={`flex items-center gap-1 text-[11px] ${dueColor(task.dueOn)}`}>
                        <Calendar className="w-3 h-3" />
                        {task.dueOn ? format(parseISO(task.dueOn), 'dd MMM') : 'No due date'}
                      </span>
                      {task.integrationName && (
                        <span className="text-[11px] text-gray-400 truncate">{task.integrationName}</span>
                      )}
                    </div>
                  </div>
                  {renderAction?.(task)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
