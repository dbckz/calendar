'use client';

import { useMemo } from 'react';
import { format, parseISO, isPast, isToday } from 'date-fns';
import { Bot, Calendar, Zap } from 'lucide-react';
import { CalendarEvent, TaskMetadata } from '@/types';
import { usePaged, PageBar, useFitCount } from './PageBar';

const ROW_PX = 46; // approx height of one compact task row incl. gap

interface AiRunnableTasksProps {
  tasks: CalendarEvent[];                      // incomplete Asana tasks
  metadataByGid: Record<string, TaskMetadata>;
  onTaskClick?: (taskId: string, navIds?: string[]) => void; // open the task dialog in-place
  onDelegate?: (task: CalendarEvent) => void;  // open the compose-brief modal directly
}

function dueColor(dueOn?: string): string {
  if (!dueOn) return 'text-gray-400';
  const date = parseISO(dueOn);
  if (isPast(date) && !isToday(date)) return 'text-red-500';
  if (isToday(date)) return 'text-orange-500';
  return 'text-gray-500';
}

// A dedicated section for tasks flagged aiDelegable in their metadata — the ones
// an agent can realistically run end to end. One click to brief and delegate.
export function AiRunnableTasks({ tasks, metadataByGid, onTaskClick, onDelegate }: AiRunnableTasksProps) {
  const runnable = useMemo(
    () => tasks
      .filter(t => !t.completed && metadataByGid[t.id]?.aiDelegable)
      .sort((a, b) => (a.dueOn || '9999').localeCompare(b.dueOn || '9999')),
    [tasks, metadataByGid]
  );
  const [listRef, perPage] = useFitCount<HTMLUListElement>(ROW_PX);
  const { page, pageCount, pageItems, next, prev } = usePaged(runnable, perPage);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 h-full flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-2 flex-shrink-0">
        <Bot className="w-4 h-4 text-indigo-600" />
        <h2 className="text-base font-semibold text-gray-900">AI-runnable</h2>
        {runnable.length > 0 && <span className="text-xs text-gray-400">{runnable.length}</span>}
      </div>

      {runnable.length === 0 ? (
        <p className="text-sm text-gray-400 italic">
          No tasks flagged AI-runnable yet. Hit “Assess AI-runnable”, or tick “🤖 AI-delegable” on a task.
        </p>
      ) : (
        <ul ref={listRef} className="space-y-0.5 flex-1 min-h-0 overflow-hidden">
          {pageItems.map(task => (
            <li
              key={task.id}
              onClick={() => onTaskClick?.(task.id, runnable.map(t => t.id))}
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
              {onDelegate && task.integrationId && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelegate(task); }}
                  className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-md bg-indigo-600 text-white opacity-0 group-hover:opacity-100 hover:bg-indigo-700 transition-opacity"
                  title="Delegate to agent"
                >
                  <Zap className="w-3 h-3" /> Delegate
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <PageBar page={page} pageCount={pageCount} onPrev={prev} onNext={next} />
    </div>
  );
}
