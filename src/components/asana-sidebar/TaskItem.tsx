'use client';

import { memo, forwardRef } from 'react';
import { Calendar, GripVertical, Check, Trash2 } from 'lucide-react';
import { format, parseISO, isToday, isPast } from 'date-fns';
import { TaskMetadataBadges } from '../TaskMetadataEditor';
import { TaskItemProps } from './types';

export const MemoizedTaskItem = memo(
  forwardRef<HTMLLIElement, TaskItemProps>(function TaskItem(
    { task, onDragStart, scheduledDuration, formatDuration, onClick, isHighlighted, onComplete, onDelete, metadata, bulkMode, isSelected, onToggleSelect },
    ref
  ) {
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

    const handleComplete = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onComplete && task.integrationId) {
        onComplete(task.id, task.integrationId, true);
      }
    };

    const handleDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onDelete && task.integrationId) {
        onDelete(task.id, task.integrationId);
      }
    };

    return (
      <li
        ref={ref}
        draggable={!bulkMode}
        onDragStart={(e) => onDragStart(e, task)}
        onClick={bulkMode ? () => onToggleSelect?.(task.id) : onClick}
        className={`group flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-all ${
          isHighlighted
            ? 'bg-orange-100 ring-2 ring-orange-400'
            : isSelected
              ? 'bg-indigo-50 ring-1 ring-indigo-300'
              : 'hover:bg-gray-50'
        }`}
      >
        {bulkMode ? (
          <input
            type="checkbox"
            checked={!!isSelected}
            onChange={() => onToggleSelect?.(task.id)}
            onClick={(e) => e.stopPropagation()}
            className="mt-1 flex-shrink-0 accent-indigo-600"
          />
        ) : (
          <GripVertical className="w-4 h-4 text-gray-300 group-hover:text-gray-400 mt-0.5 flex-shrink-0 cursor-grab active:cursor-grabbing" />
        )}
        <div className="flex-1 min-w-0">
          {task.parentTask && (
            <p className="text-xs text-gray-400 truncate mb-0.5" title={`Subtask of: ${task.parentTask.name}`}>
              ↳ {task.parentTask.name}
            </p>
          )}
          <p className="text-sm font-medium text-gray-900 line-clamp-2">
            {task.title}
          </p>
          <div className="flex items-center justify-between mt-1.5">
            <div className={`flex items-center gap-1 text-xs ${getDueDateColor(task.dueOn)}`}>
              <Calendar className="w-3 h-3" />
              <span>{formatDueDate(task.dueOn)}</span>
            </div>
            <div className="flex items-center gap-1">
              <TaskMetadataBadges metadata={metadata} />
              {scheduledDuration !== undefined && scheduledDuration > 0 && (
                <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">
                  {formatDuration(scheduledDuration)} scheduled
                </span>
              )}
              {task.integrationName && !scheduledDuration && (
                <span className="text-xs text-gray-400 truncate max-w-[80px]" title={task.integrationName}>
                  {task.integrationName}
                </span>
              )}
            </div>
          </div>
        </div>
        {/* Action buttons - show on hover */}
        {task.integrationId && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            {onComplete && (
              <button
                onClick={handleComplete}
                className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                title="Mark complete"
              >
                <Check className="w-4 h-4" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={handleDelete}
                className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                title="Delete task"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </li>
    );
  })
);
