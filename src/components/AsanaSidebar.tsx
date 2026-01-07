'use client';

import { useState, memo, useMemo, useCallback, useRef, useEffect, forwardRef } from 'react';
import { CalendarEvent, DragItem, AsanaProject, AsanaFilterState, AsanaDueDateFilter, ScheduledAsanaTask } from '@/types';
import { Calendar, GripVertical, Filter, X, ChevronDown, ExternalLink, MessageSquare, Send, Check } from 'lucide-react';
import { format, parseISO, isToday, isPast } from 'date-fns';
import { getAsanaTaskUrl } from '@/lib/asana';

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
  scheduledAsanaTasks?: ScheduledAsanaTask[];
  onUnschedule?: (taskId: string) => void;
  colorScheme?: ColorScheme;
  // Filter props
  projects?: AsanaProject[];
  filters?: AsanaFilterState;
  onFiltersChange?: (filters: AsanaFilterState) => void;
  onClearFilters?: () => void;
  // Asana actions
  onToggleComplete?: (taskId: string, integrationId: string, completed: boolean) => void;
  onAddComment?: (taskId: string, integrationId: string, comment: string) => void;
  // Highlight task from calendar click
  highlightedTaskId?: string | null;
  onClearHighlight?: () => void;
}

const DUE_DATE_OPTIONS: { value: AsanaDueDateFilter; label: string }[] = [
  { value: 'all', label: 'All dates' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This week' },
  { value: 'no_date', label: 'No due date' },
];

export function AsanaSidebar({
  tasks,
  isLoading,
  scheduledAsanaTasks = [],
  onUnschedule,
  colorScheme,
  projects = [],
  filters,
  onFiltersChange,
  onClearFilters,
  onToggleComplete,
  onAddComment,
  highlightedTaskId,
  onClearHighlight,
}: AsanaSidebarProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTask, setSelectedTask] = useState<CalendarEvent | null>(null);
  const taskRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const listRef = useRef<HTMLUListElement>(null);

  // Calculate total scheduled duration per task (could be scheduled multiple times)
  const scheduledDurations = useMemo(() => {
    const durations = new Map<string, number>();
    scheduledAsanaTasks.forEach(s => {
      const current = durations.get(s.asanaTaskId) || 0;
      durations.set(s.asanaTaskId, current + s.duration);
    });
    return durations;
  }, [scheduledAsanaTasks]);

  // Format duration as "Xh Ym"
  const formatDuration = useCallback((minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  }, []);

  // Scroll to and highlight task when highlightedTaskId changes
  useEffect(() => {
    if (highlightedTaskId) {
      const taskElement = taskRefs.current.get(highlightedTaskId);
      if (taskElement) {
        taskElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [highlightedTaskId]);

  // Get unique integrations from tasks
  const integrations = useMemo(() => {
    const seen = new Map<string, string>();
    tasks.forEach(task => {
      if (task.integrationId && task.integrationName && !seen.has(task.integrationId)) {
        seen.set(task.integrationId, task.integrationName);
      }
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [tasks]);

  // Check if any filters are active
  const hasActiveFilters = filters && (
    filters.integrationIds.length > 0 ||
    filters.projectIds.length > 0 ||
    filters.dueDateRange !== 'all'
  );

  const handleIntegrationToggle = (integrationId: string) => {
    if (!filters || !onFiltersChange) return;
    const newIds = filters.integrationIds.includes(integrationId)
      ? filters.integrationIds.filter(id => id !== integrationId)
      : [...filters.integrationIds, integrationId];
    onFiltersChange({ ...filters, integrationIds: newIds });
  };

  const handleDueDateChange = (value: AsanaDueDateFilter) => {
    if (!filters || !onFiltersChange) return;
    onFiltersChange({ ...filters, dueDateRange: value });
  };

  const handleDragStart = (e: React.DragEvent, task: CalendarEvent) => {
    const dragItem: DragItem = {
      type: 'asana-task',
      id: task.id,
      source: 'asana',
      title: task.title,
      duration: 30, // Default 30 min duration
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-orange-500" />
            <h2 className={`font-semibold ${colorScheme?.sidebarHeaderText || 'text-gray-900'}`}>Asana Tasks</h2>
          </div>
          {filters && onFiltersChange && (
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-1.5 rounded-md transition-colors ${
                hasActiveFilters
                  ? 'bg-orange-100 text-orange-600'
                  : 'hover:bg-gray-100 text-gray-500'
              }`}
              title={showFilters ? 'Hide filters' : 'Show filters'}
            >
              <Filter className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-sm mt-1 text-gray-500">
          {tasks.length} task{tasks.length !== 1 ? 's' : ''}
        </p>

        {/* Filter Panel */}
        {showFilters && filters && onFiltersChange && (
          <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
            {/* Integration filter */}
            {integrations.length > 1 && (
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1.5">Integration</label>
                <div className="flex flex-wrap gap-1.5">
                  {integrations.map(integration => (
                    <button
                      key={integration.id}
                      onClick={() => handleIntegrationToggle(integration.id)}
                      className={`text-xs px-2 py-1 rounded-full transition-colors ${
                        filters.integrationIds.length === 0 || filters.integrationIds.includes(integration.id)
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {integration.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Due date filter */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Due date</label>
              <div className="relative">
                <select
                  value={filters.dueDateRange}
                  onChange={(e) => handleDueDateChange(e.target.value as AsanaDueDateFilter)}
                  className="w-full text-sm bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1.5 pr-8 appearance-none focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                >
                  {DUE_DATE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Clear filters */}
            {hasActiveFilters && onClearFilters && (
              <button
                onClick={onClearFilters}
                className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700"
              >
                <X className="w-3 h-3" />
                Clear filters
              </button>
            )}
          </div>
        )}
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
          <ul ref={listRef} className="p-2 space-y-1">
            {tasks.map(task => (
              <MemoizedTaskItem
                key={`${task.integrationId || 'default'}-${task.id}`}
                task={task}
                onDragStart={handleDragStart}
                scheduledDuration={scheduledDurations.get(task.id)}
                formatDuration={formatDuration}
                onClick={() => setSelectedTask(task)}
                isHighlighted={highlightedTaskId === task.id}
                ref={(el) => {
                  if (el) taskRefs.current.set(task.id, el);
                  else taskRefs.current.delete(task.id);
                }}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Task Detail Dialog */}
      {selectedTask && (
        <TaskDetailDialog
          task={selectedTask}
          scheduledDuration={scheduledDurations.get(selectedTask.id)}
          formatDuration={formatDuration}
          onClose={() => {
            setSelectedTask(null);
            onClearHighlight?.();
          }}
          onToggleComplete={onToggleComplete}
          onAddComment={onAddComment}
        />
      )}
    </div>
  );
}

// Task Detail Dialog Component
interface TaskDetailDialogProps {
  task: CalendarEvent;
  scheduledDuration?: number;
  formatDuration: (minutes: number) => string;
  onClose: () => void;
  onToggleComplete?: (taskId: string, integrationId: string, completed: boolean) => void;
  onAddComment?: (taskId: string, integrationId: string, comment: string) => void;
}

function TaskDetailDialog({
  task,
  scheduledDuration,
  formatDuration,
  onClose,
  onToggleComplete,
  onAddComment,
}: TaskDetailDialogProps) {
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim() || !onAddComment || !task.integrationId) return;

    setIsSubmitting(true);
    try {
      await onAddComment(task.id, task.integrationId, comment.trim());
      setComment('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleComplete = async () => {
    if (!onToggleComplete || !task.integrationId) return;

    setIsToggling(true);
    try {
      await onToggleComplete(task.id, task.integrationId, !task.completed);
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold text-gray-900 line-clamp-2">{task.title}</h3>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {task.description && (
            <p className="text-sm text-gray-600 mt-2 line-clamp-3">{task.description}</p>
          )}
          <div className="flex items-center gap-3 mt-3 text-sm text-gray-500">
            {task.dueOn && (
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {format(parseISO(task.dueOn), 'MMM d, yyyy')}
              </span>
            )}
            {scheduledDuration !== undefined && scheduledDuration > 0 && (
              <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-xs">
                {formatDuration(scheduledDuration)} scheduled
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 space-y-4">
          {/* Complete/Reopen button */}
          {onToggleComplete && task.integrationId && (
            <button
              onClick={handleToggleComplete}
              disabled={isToggling}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors ${
                task.completed
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  : 'bg-green-600 text-white hover:bg-green-700'
              } disabled:opacity-50`}
            >
              <Check className="w-4 h-4" />
              {isToggling ? 'Updating...' : task.completed ? 'Reopen Task' : 'Mark Complete'}
            </button>
          )}

          {/* Add comment */}
          {onAddComment && task.integrationId && (
            <form onSubmit={handleSubmitComment} className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Add a comment</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Write a comment..."
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                  disabled={isSubmitting}
                />
                <button
                  type="submit"
                  disabled={!comment.trim() || isSubmitting}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {/* Open in Asana */}
          <a
            href={getAsanaTaskUrl(task.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Open in Asana
          </a>
        </div>
      </div>
    </div>
  );
}

interface TaskItemProps {
  task: CalendarEvent;
  onDragStart: (e: React.DragEvent, task: CalendarEvent) => void;
  scheduledDuration?: number;
  formatDuration: (minutes: number) => string;
  onClick: () => void;
  isHighlighted?: boolean;
}

const MemoizedTaskItem = memo(
  forwardRef<HTMLLIElement, TaskItemProps>(function TaskItem(
    { task, onDragStart, scheduledDuration, formatDuration, onClick, isHighlighted },
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

    return (
      <li
        ref={ref}
        draggable
        onDragStart={(e) => onDragStart(e, task)}
        onClick={onClick}
        className={`group flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-all ${
          isHighlighted
            ? 'bg-orange-100 ring-2 ring-orange-400'
            : 'hover:bg-gray-50'
        }`}
      >
        <GripVertical className="w-4 h-4 text-gray-300 group-hover:text-gray-400 mt-0.5 flex-shrink-0 cursor-grab active:cursor-grabbing" />
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
      </li>
    );
  })
);
