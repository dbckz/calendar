'use client';

import { useState, memo } from 'react';
import { CalendarEvent, DragItem } from '@/types';
import { Calendar, GripVertical } from 'lucide-react';
import { format, parseISO, isToday, isPast } from 'date-fns';

interface ColorScheme {
  headerBg: string;
  headerText: string;
  sidebarHeaderBg: string;
  sidebarHeaderText: string;
  mainBg: string;
}

interface AsanaSidebarProps {
  tasks: CalendarEvent[];
  isLoading: boolean;
  scheduledTaskIds?: Set<string>;
  onUnschedule?: (taskId: string) => void;
  colorScheme?: ColorScheme;
}

export function AsanaSidebar({ tasks, isLoading, scheduledTaskIds, onUnschedule, colorScheme }: AsanaSidebarProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragStart = (e: React.DragEvent, task: CalendarEvent) => {
    const dragItem: DragItem = {
      type: 'asana-task',
      id: task.id,
      source: 'asana',
      title: task.title,
      duration: 60, // Default 1 hour duration
    };
    e.dataTransfer.setData('application/json', JSON.stringify(dragItem));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only set to false if leaving the container entirely
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    try {
      const data = e.dataTransfer.getData('application/json');
      if (!data) return;

      const dragItem: DragItem = JSON.parse(data);
      console.log('[AsanaSidebar] Drop received:', dragItem);

      // Only unschedule asana tasks dropped here
      if (dragItem.source === 'asana' && onUnschedule) {
        console.log('[AsanaSidebar] Unscheduling task:', dragItem.id);
        onUnschedule(dragItem.id);
      }
    } catch (err) {
      console.error('Failed to parse drag data:', err);
    }
  };

  return (
    <div
      className={`bg-white border-r border-gray-200 h-full overflow-hidden flex flex-col transition-colors ${
        isDragOver ? 'bg-orange-50' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={`p-4 border-b border-gray-200 ${colorScheme?.sidebarHeaderBg || ''}`}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-orange-500" />
          <h2 className={`font-semibold ${colorScheme?.sidebarHeaderText || 'text-gray-900'}`}>Asana Tasks</h2>
        </div>
        <p className="text-sm mt-1 text-gray-500">
          {tasks.length} task{tasks.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            No incomplete Asana tasks
          </div>
        ) : (
          <ul className="p-2 space-y-1">
            {tasks.map(task => (
              <MemoizedTaskItem
                key={`${task.integrationId || 'default'}-${task.id}`}
                task={task}
                onDragStart={handleDragStart}
                isScheduled={scheduledTaskIds?.has(task.id) || false}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface TaskItemProps {
  task: CalendarEvent;
  onDragStart: (e: React.DragEvent, task: CalendarEvent) => void;
  isScheduled?: boolean;
}

function TaskItem({ task, onDragStart, isScheduled }: TaskItemProps) {
  const formatDueDate = (dueOn: string | undefined) => {
    if (!dueOn) return 'No due date';
    const date = parseISO(dueOn);
    return format(date, 'dd-MM-yy');
  };

  const getDueDateColor = (dueOn: string | undefined) => {
    if (!dueOn) return 'text-gray-400';
    const date = parseISO(dueOn);
    if (isPast(date) && !isToday(date)) return 'text-red-500';
    if (isToday(date)) return 'text-orange-500';
    return 'text-gray-500';
  };

  return (
    <li
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      className="group flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-grab active:cursor-grabbing"
    >
      <GripVertical className="w-4 h-4 text-gray-300 group-hover:text-gray-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 line-clamp-2">
          {task.title}
        </p>
        <div className="flex items-center justify-between mt-1.5">
          <div className={`flex items-center gap-1 text-xs ${getDueDateColor(task.dueOn)}`}>
            <Calendar className="w-3 h-3" />
            <span>{formatDueDate(task.dueOn)}</span>
          </div>
          <div className="flex items-center gap-1">
            {isScheduled && (
              <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">
                Scheduled
              </span>
            )}
            {task.integrationName && !isScheduled && (
              <span className="text-xs text-gray-400 truncate max-w-[80px]" title={task.integrationName}>
                {task.integrationName}
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

// Memoize the TaskItem to prevent re-renders when parent updates
const MemoizedTaskItem = memo(TaskItem);
