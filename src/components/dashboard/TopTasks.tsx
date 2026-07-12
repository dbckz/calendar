'use client';

import { useMemo } from 'react';
import { format, parseISO, isPast, isToday } from 'date-fns';
import { Calendar } from 'lucide-react';
import { CalendarEvent, TaskMetadata } from '@/types';
import { rankTasks } from '@/lib/task-ranking';
import { TaskMetadataBadges } from '@/components/TaskMetadataEditor';

interface TopTasksProps {
  tasks: CalendarEvent[]; // incomplete Asana tasks
  metadataByGid: Record<string, TaskMetadata>;
  onTaskClick?: (taskId: string) => void;
  limit?: number;
}

function dueColor(dueOn?: string): string {
  if (!dueOn) return 'text-gray-400';
  const date = parseISO(dueOn);
  if (isPast(date) && !isToday(date)) return 'text-red-500';
  if (isToday(date)) return 'text-orange-500';
  return 'text-gray-500';
}

export function TopTasks({ tasks, metadataByGid, onTaskClick, limit = 8 }: TopTasksProps) {
  const ranked = useMemo(() => {
    const incomplete = tasks.filter(t => !t.completed);
    return rankTasks(incomplete, metadataByGid).slice(0, limit);
  }, [tasks, metadataByGid, limit]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Tasks</h2>
      {ranked.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No tasks to show.</p>
      ) : (
        <ul className="space-y-1.5">
          {ranked.map(task => (
            <li
              key={task.id}
              onClick={() => onTaskClick?.(task.id)}
              className={`flex items-center gap-2 p-2 rounded-lg ${
                onTaskClick ? 'cursor-pointer hover:bg-gray-50' : ''
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`flex items-center gap-1 text-xs ${dueColor(task.dueOn)}`}>
                    <Calendar className="w-3 h-3" />
                    {task.dueOn ? format(parseISO(task.dueOn), 'dd MMM') : 'No due date'}
                  </span>
                  {task.integrationName && (
                    <span className="text-xs text-gray-400 truncate">{task.integrationName}</span>
                  )}
                </div>
              </div>
              <TaskMetadataBadges metadata={metadataByGid[task.id]} className="flex-shrink-0" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
