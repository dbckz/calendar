'use client';

import { useMemo } from 'react';
import { format, parseISO, isPast, isToday } from 'date-fns';
import { Calendar } from 'lucide-react';
import { CalendarEvent, TaskMetadata } from '@/types';
import { rankTasks } from '@/lib/task-ranking';
import { TaskMetadataBadges } from '@/components/TaskMetadataEditor';
import { usePaged, PageBar, useFitCount } from './PageBar';

const ROW_PX = 46; // approx height of one compact task row incl. gap

interface TopTasksProps {
  tasks: CalendarEvent[]; // incomplete Asana tasks
  metadataByGid: Record<string, TaskMetadata>;
  onTaskClick?: (taskId: string, navIds?: string[]) => void;
}

function dueColor(dueOn?: string): string {
  if (!dueOn) return 'text-gray-400';
  const date = parseISO(dueOn);
  if (isPast(date) && !isToday(date)) return 'text-red-500';
  if (isToday(date)) return 'text-orange-500';
  return 'text-gray-500';
}

export function TopTasks({ tasks, metadataByGid, onTaskClick }: TopTasksProps) {
  const ranked = useMemo(
    () => rankTasks(tasks.filter(t => !t.completed), metadataByGid),
    [tasks, metadataByGid]
  );
  const [listRef, perPage] = useFitCount<HTMLUListElement>(ROW_PX);
  const { page, pageCount, pageItems, next, prev } = usePaged(ranked, perPage);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h2 className="text-base font-semibold text-gray-900">Top Tasks</h2>
        {ranked.length > 0 && <span className="text-xs text-gray-400">{ranked.length}</span>}
      </div>
      {ranked.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No tasks to show.</p>
      ) : (
        <ul ref={listRef} className="space-y-0.5 flex-1 min-h-0 overflow-hidden">
          {pageItems.map(task => (
            <li
              key={task.id}
              onClick={() => onTaskClick?.(task.id, ranked.map(t => t.id))}
              className={`flex items-center gap-2 px-2 py-1 rounded-lg ${
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
              <TaskMetadataBadges metadata={metadataByGid[task.id]} className="flex-shrink-0" />
            </li>
          ))}
        </ul>
      )}
      <PageBar page={page} pageCount={pageCount} onPrev={prev} onNext={next} />
    </div>
  );
}
