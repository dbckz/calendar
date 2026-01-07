'use client';

import { useState, memo, useMemo, useCallback, useRef, useEffect, forwardRef } from 'react';
import { CalendarEvent, DragItem, AsanaProject, AsanaFilterState, AsanaDateFilter, AsanaSortField, AsanaSortDirection, AsanaFilterLogic, ScheduledAsanaTask } from '@/types';
import { Calendar, GripVertical, Filter, X, ChevronDown, ExternalLink, Send, Check, ArrowUpDown, Clock, Folder, Tag, PlayCircle } from 'lucide-react';
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
  typeValues?: string[]; // Unique Type custom field values
  integrations?: { id: string; name: string }[]; // Unique integrations from all tasks
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

const DATE_FILTER_OPTIONS: { value: AsanaDateFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This week' },
  { value: 'no_date', label: 'No date' },
];

const SORT_OPTIONS: { value: AsanaSortField; label: string }[] = [
  { value: 'dueOn', label: 'Due date' },
  { value: 'startOn', label: 'Start date' },
  { value: 'createdAt', label: 'Created' },
  { value: 'title', label: 'Title' },
  { value: 'type', label: 'Type' },
];

export function AsanaSidebar({
  tasks,
  isLoading,
  scheduledAsanaTasks = [],
  onUnschedule,
  colorScheme,
  projects = [],
  typeValues = [],
  integrations = [],
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
  const [showSort, setShowSort] = useState(false);
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

  // Check if any filters are active
  const hasActiveFilters = filters && (
    filters.integrationIds.length > 0 ||
    filters.projectIds.length > 0 ||
    filters.typeValues.length > 0 ||
    filters.dueDateRange !== 'all' ||
    filters.startDateRange !== 'all'
  );

  const handleIntegrationToggle = (integrationId: string) => {
    if (!filters || !onFiltersChange) return;
    const newIds = filters.integrationIds.includes(integrationId)
      ? filters.integrationIds.filter(id => id !== integrationId)
      : [...filters.integrationIds, integrationId];
    onFiltersChange({ ...filters, integrationIds: newIds });
  };

  const handleProjectToggle = (projectId: string) => {
    if (!filters || !onFiltersChange) return;
    const newIds = filters.projectIds.includes(projectId)
      ? filters.projectIds.filter(id => id !== projectId)
      : [...filters.projectIds, projectId];
    onFiltersChange({ ...filters, projectIds: newIds });
  };

  const handleTypeToggle = (typeValue: string) => {
    if (!filters || !onFiltersChange) return;
    const newTypes = filters.typeValues.includes(typeValue)
      ? filters.typeValues.filter(t => t !== typeValue)
      : [...filters.typeValues, typeValue];
    onFiltersChange({ ...filters, typeValues: newTypes });
  };

  const handleDueDateChange = (value: AsanaDateFilter) => {
    if (!filters || !onFiltersChange) return;
    onFiltersChange({ ...filters, dueDateRange: value });
  };

  const handleStartDateChange = (value: AsanaDateFilter) => {
    if (!filters || !onFiltersChange) return;
    onFiltersChange({ ...filters, startDateRange: value });
  };

  const handleFilterLogicChange = (logic: AsanaFilterLogic) => {
    if (!filters || !onFiltersChange) return;
    onFiltersChange({ ...filters, filterLogic: logic });
  };

  const handleSortChange = (field: AsanaSortField) => {
    if (!filters || !onFiltersChange) return;
    // If clicking same field, toggle direction; otherwise set new field with asc
    if (filters.sortField === field) {
      onFiltersChange({
        ...filters,
        sortDirection: filters.sortDirection === 'asc' ? 'desc' : 'asc',
      });
    } else {
      onFiltersChange({ ...filters, sortField: field, sortDirection: 'asc' });
    }
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
          <div className="flex items-center gap-1">
            {filters && onFiltersChange && (
              <>
                <button
                  onClick={() => { setShowSort(!showSort); setShowFilters(false); }}
                  className={`p-1.5 rounded-md transition-colors ${
                    showSort ? 'bg-orange-100 text-orange-600' : 'hover:bg-gray-100 text-gray-500'
                  }`}
                  title="Sort"
                >
                  <ArrowUpDown className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { setShowFilters(!showFilters); setShowSort(false); }}
                  className={`p-1.5 rounded-md transition-colors ${
                    hasActiveFilters
                      ? 'bg-orange-100 text-orange-600'
                      : showFilters ? 'bg-orange-100 text-orange-600' : 'hover:bg-gray-100 text-gray-500'
                  }`}
                  title={showFilters ? 'Hide filters' : 'Show filters'}
                >
                  <Filter className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
        <p className="text-sm mt-1 text-gray-500">
          {tasks.length} task{tasks.length !== 1 ? 's' : ''}
        </p>

        {/* Sort Panel */}
        {showSort && filters && onFiltersChange && (
          <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
            <label className="text-xs font-medium text-gray-600 block">Sort by</label>
            <div className="flex flex-wrap gap-1.5">
              {SORT_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => handleSortChange(option.value)}
                  className={`text-xs px-2 py-1 rounded-full transition-colors flex items-center gap-1 ${
                    filters.sortField === option.value
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {option.label}
                  {filters.sortField === option.value && (
                    <span className="text-[10px]">{filters.sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filter Panel */}
        {showFilters && filters && onFiltersChange && (
          <div className="mt-3 pt-3 border-t border-gray-200 space-y-3 max-h-[400px] overflow-y-auto">
            {/* AND/OR logic toggle */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Filter logic</label>
              <div className="flex gap-1">
                <button
                  onClick={() => handleFilterLogicChange('and')}
                  className={`text-xs px-3 py-1 rounded-l-md border transition-colors ${
                    filters.filterLogic === 'and'
                      ? 'bg-orange-100 text-orange-700 border-orange-300'
                      : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  AND
                </button>
                <button
                  onClick={() => handleFilterLogicChange('or')}
                  className={`text-xs px-3 py-1 rounded-r-md border-t border-r border-b transition-colors ${
                    filters.filterLogic === 'or'
                      ? 'bg-orange-100 text-orange-700 border-orange-300'
                      : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  OR
                </button>
              </div>
            </div>

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
                        filters.integrationIds.includes(integration.id)
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {integration.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Project filter */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5 flex items-center gap-1">
                <Folder className="w-3 h-3" /> Project
              </label>
              {projects.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {projects.map(project => (
                    <button
                      key={project.gid}
                      onClick={() => handleProjectToggle(project.gid)}
                      className={`text-xs px-2 py-1 rounded-full transition-colors truncate max-w-[150px] ${
                        filters.projectIds.includes(project.gid)
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                      title={project.name}
                    >
                      {project.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">No projects available</p>
              )}
            </div>

            {/* Type filter */}
            {typeValues.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1.5 flex items-center gap-1">
                  <Tag className="w-3 h-3" /> Type
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {typeValues.map(typeValue => (
                    <button
                      key={typeValue}
                      onClick={() => handleTypeToggle(typeValue)}
                      className={`text-xs px-2 py-1 rounded-full transition-colors ${
                        filters.typeValues.includes(typeValue)
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {typeValue}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Start date filter */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5 flex items-center gap-1">
                <PlayCircle className="w-3 h-3" /> Start date
              </label>
              <div className="relative">
                <select
                  value={filters.startDateRange}
                  onChange={(e) => handleStartDateChange(e.target.value as AsanaDateFilter)}
                  className="w-full text-sm bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1.5 pr-8 appearance-none focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                >
                  {DATE_FILTER_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Due date filter */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Due date
              </label>
              <div className="relative">
                <select
                  value={filters.dueDateRange}
                  onChange={(e) => handleDueDateChange(e.target.value as AsanaDateFilter)}
                  className="w-full text-sm bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1.5 pr-8 appearance-none focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                >
                  {DATE_FILTER_OPTIONS.map(option => (
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
                Clear all filters
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

  // Get Type custom field
  const typeField = task.customFields?.find(cf => cf.name.toLowerCase() === 'type');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold text-gray-900 line-clamp-2">{task.title}</h3>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Type badge */}
          {typeField?.displayValue && (
            <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
              <Tag className="w-3 h-3" />
              {typeField.displayValue}
            </span>
          )}

          {/* Scheduled duration */}
          {scheduledDuration !== undefined && scheduledDuration > 0 && (
            <span className="inline-flex ml-2 mt-2 bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-xs">
              {formatDuration(scheduledDuration)} scheduled
            </span>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Notes/Description */}
          {task.description && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notes</label>
              <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {/* Task Details Grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {/* Start date */}
            {task.startOn && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
                  <PlayCircle className="w-3 h-3" /> Start
                </label>
                <p className="text-gray-900 mt-0.5">{format(parseISO(task.startOn), 'MMM d, yyyy')}</p>
              </div>
            )}

            {/* Due date */}
            {task.dueOn && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Due
                </label>
                <p className={`mt-0.5 ${
                  isPast(parseISO(task.dueOn)) && !isToday(parseISO(task.dueOn))
                    ? 'text-red-600 font-medium'
                    : isToday(parseISO(task.dueOn))
                    ? 'text-orange-600 font-medium'
                    : 'text-gray-900'
                }`}>
                  {format(parseISO(task.dueOn), 'MMM d, yyyy')}
                </p>
              </div>
            )}

            {/* Created at */}
            {task.createdAt && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Created</label>
                <p className="text-gray-900 mt-0.5">{format(parseISO(task.createdAt), 'MMM d, yyyy')}</p>
              </div>
            )}

            {/* Integration */}
            {task.integrationName && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Integration</label>
                <p className="text-gray-900 mt-0.5">{task.integrationName}</p>
              </div>
            )}
          </div>

          {/* Projects */}
          {task.projects && task.projects.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <Folder className="w-3 h-3" /> Projects
              </label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {task.projects.map(project => (
                  <span
                    key={project.gid}
                    className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs"
                  >
                    {project.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions - fixed at bottom */}
        <div className="p-4 border-t border-gray-200 space-y-3 flex-shrink-0">
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
