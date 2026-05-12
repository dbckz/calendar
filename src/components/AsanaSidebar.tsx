'use client';

import { useState, memo, useMemo, useCallback, useRef, useEffect, forwardRef } from 'react';
import { CalendarEvent, DragItem, AsanaProject, AsanaFilterState, AsanaDateFilter, AsanaSortField, AsanaFilterLogic, AsanaGroupBy, ScheduledAsanaTask, AsanaStory } from '@/types';
import { Calendar, GripVertical, Filter, X, ChevronDown, ChevronUp, ChevronRight, ExternalLink, Send, Check, ArrowUpDown, Clock, Folder, Tag, PlayCircle, Plus, Trash2, MessageSquare, Loader2, Layers, Search } from 'lucide-react';
import { format, parseISO, isToday, isPast } from 'date-fns';
import { getAsanaTaskUrl } from '@/lib/asana';
import { api } from '@/lib/api';

// Helper component to render text with clickable links
function LinkifiedText({ text, className }: { text: string; className?: string }) {
  // Regex to match URLs (http, https, or www)
  const urlRegex = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;

  const parts = text.split(urlRegex);
  const matches = text.match(urlRegex) || [];

  const elements: React.ReactNode[] = [];
  let matchIndex = 0;

  parts.forEach((part, index) => {
    if (part === matches[matchIndex]) {
      // This part is a URL
      const url = part.startsWith('www.') ? `https://${part}` : part;
      elements.push(
        <a
          key={index}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 hover:underline break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
      matchIndex++;
    } else if (part) {
      // Regular text
      elements.push(<span key={index}>{part}</span>);
    }
  });

  return <span className={className}>{elements}</span>;
}

interface ColorScheme {
  headerBg: string;
  headerText: string;
  sidebarHeaderBg: string;
  sidebarHeaderText: string;
  mainBg: string;
}

interface AsanaSidebarTypeFieldInfo {
  fieldGid: string;
  enumOptions: Map<string, string>; // displayValue -> enumOptionGid
}

interface UpdateTaskOptions {
  dueOn?: string | null;
  startOn?: string | null;
  customFields?: Record<string, string | null>;
  addProjects?: string[];
  removeProjects?: string[];
}

interface AsanaSidebarProps {
  tasks: CalendarEvent[];
  isLoading: boolean;
  scheduledAsanaTasks?: ScheduledAsanaTask[];
  onUnschedule?: (taskId: string) => void;
  colorScheme?: ColorScheme;
  // Lock to a specific integration (hides integration filter)
  lockedIntegrationId?: string;
  // Filter props
  projects?: AsanaProject[];
  typeValues?: string[]; // Unique Type custom field values
  typeFieldInfoByIntegration?: Map<string, AsanaSidebarTypeFieldInfo>; // Info for setting Type field, per integration
  integrations?: { id: string; name: string }[]; // Unique integrations from all tasks
  filters?: AsanaFilterState;
  onFiltersChange?: (filters: AsanaFilterState) => void;
  onClearFilters?: () => void;
  // Asana actions (optimistic: return immediately, errors shown via toast)
  onToggleComplete?: (taskId: string, integrationId: string, completed: boolean) => void;
  onAddComment?: (taskId: string, integrationId: string, comment: string) => void;
  onCreateTask?: (integrationId: string, name: string, options?: { notes?: string; dueOn?: string; projectGid?: string; customFields?: Record<string, string> }) => Promise<CalendarEvent | null>;
  onUpdateTask?: (taskId: string, integrationId: string, updates: UpdateTaskOptions) => void;
  onDeleteTask?: (taskId: string, integrationId: string) => void;
  // Highlight task from calendar click (single click - just navigate/scroll)
  highlightedTaskId?: string | null;
  onClearHighlight?: () => void;
  // Open task dialog from calendar double-click
  openTaskDialogId?: string | null;
  onClearOpenTaskDialog?: () => void;
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

const GROUP_BY_OPTIONS: { value: AsanaGroupBy; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'type', label: 'Type' },
];

export function AsanaSidebar({
  tasks,
  isLoading,
  scheduledAsanaTasks = [],
  onUnschedule,
  colorScheme,
  lockedIntegrationId,
  projects = [],
  typeValues = [],
  typeFieldInfoByIntegration,
  integrations = [],
  filters,
  onFiltersChange,
  onClearFilters,
  onToggleComplete,
  onAddComment,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  highlightedTaskId,
  onClearHighlight,
  openTaskDialogId,
  onClearOpenTaskDialog,
}: AsanaSidebarProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [showGroupBy, setShowGroupBy] = useState(false);
  const [selectedTask, setSelectedTask] = useState<CalendarEvent | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  // Initialize expandedGroups from filters (persisted state)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    return new Set(filters?.expandedGroups || []);
  });
  // Track the last synced value from filters to detect server updates
  const lastSyncedFromFiltersRef = useRef<string[]>(filters?.expandedGroups || []);

  // Helper to check if two arrays have the same elements (order-independent)
  const arraysEqual = (a: string[], b: string[]): boolean =>
    a.length === b.length && a.every(item => b.includes(item));

  // Sync expandedGroups from filters when server data arrives
  useEffect(() => {
    const serverGroups = filters?.expandedGroups || [];
    if (!arraysEqual(serverGroups, lastSyncedFromFiltersRef.current)) {
      setExpandedGroups(new Set(serverGroups));
      lastSyncedFromFiltersRef.current = serverGroups;
    }
  }, [filters?.expandedGroups]);

  // Persist expandedGroups to filters when user toggles groups
  useEffect(() => {
    if (!onFiltersChange || !filters) return;

    const expandedArray = Array.from(expandedGroups);
    const currentArray = filters.expandedGroups || [];

    if (!arraysEqual(expandedArray, currentArray)) {
      lastSyncedFromFiltersRef.current = expandedArray;
      onFiltersChange({ ...filters, expandedGroups: expandedArray });
    }
  }, [expandedGroups, filters, onFiltersChange]);

  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null); // Track which group is being dragged over
  const [optimisticTypeOverrides, setOptimisticTypeOverrides] = useState<Map<string, string>>(new Map()); // taskId -> newType for optimistic updates
  const [searchQuery, setSearchQuery] = useState(''); // Search query for filtering tasks
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

  // Filter tasks by locked integration
  const integrationFilteredTasks = useMemo(() => {
    if (!lockedIntegrationId) return tasks;
    return tasks.filter(task => task.integrationId === lockedIntegrationId);
  }, [tasks, lockedIntegrationId]);

  // Filter tasks by search query
  const searchedTasks = useMemo(() => {
    if (!searchQuery.trim()) return integrationFilteredTasks;
    const query = searchQuery.toLowerCase().trim();
    return integrationFilteredTasks.filter(task => task.title.toLowerCase().includes(query));
  }, [integrationFilteredTasks, searchQuery]);

  // Helper to get Type custom field value from a task (with optimistic override support)
  const getTaskTypeValue = useCallback((task: CalendarEvent): string => {
    const override = optimisticTypeOverrides.get(task.id);
    if (override) return override;

    const typeField = task.customFields?.find(cf => cf.name.toLowerCase() === 'type');
    return typeField?.displayValue || 'No Type';
  }, [optimisticTypeOverrides]);

  // Group tasks by the selected groupBy field
  const groupedTasks = useMemo(() => {
    if (!filters?.groupBy || filters.groupBy === 'none') {
      return null; // No grouping
    }

    const groups = new Map<string, CalendarEvent[]>();

    searchedTasks.forEach(task => {
      let groupKey: string;

      if (filters.groupBy === 'type') {
        groupKey = getTaskTypeValue(task);
      } else {
        groupKey = 'Other';
      }

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(task);
    });

    // Sort groups using custom order if available, otherwise alphabetically
    const groupOrder = filters.groupOrder || [];
    const sortedGroups = Array.from(groups.entries()).sort((a, b) => {
      const aIndex = groupOrder.indexOf(a[0]);
      const bIndex = groupOrder.indexOf(b[0]);

      // If both have custom order, use it
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      // If only one has custom order, prioritize it
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      // Otherwise sort alphabetically, but "No Type" goes last
      if (a[0] === 'No Type') return 1;
      if (b[0] === 'No Type') return -1;
      return a[0].localeCompare(b[0]);
    });

    return sortedGroups;
  }, [searchedTasks, filters?.groupBy, filters?.groupOrder, getTaskTypeValue]);

  // Scroll to and highlight task when highlightedTaskId changes (single click from calendar)
  useEffect(() => {
    if (highlightedTaskId) {
      // Find the task in the list
      const task = tasks.find(t => t.id === highlightedTaskId);
      if (task) {
        // If grouping is enabled, expand the group containing this task
        if (filters?.groupBy === 'type') {
          const taskType = getTaskTypeValue(task);
          setExpandedGroups(prev => {
            if (prev.has(taskType)) return prev;
            const next = new Set(prev);
            next.add(taskType);
            return next;
          });
        }

        // Scroll to the task (with a small delay to allow group expansion)
        setTimeout(() => {
          const taskElement = taskRefs.current.get(highlightedTaskId);
          if (taskElement) {
            taskElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      }
    }
  }, [highlightedTaskId, tasks, filters?.groupBy, getTaskTypeValue]);

  // Open task dialog when openTaskDialogId changes (double click from calendar)
  useEffect(() => {
    if (openTaskDialogId) {
      const task = tasks.find(t => t.id === openTaskDialogId);
      if (task) {
        setSelectedTask(task);
      }
      // Clear the trigger after opening
      onClearOpenTaskDialog?.();
    }
  }, [openTaskDialogId, tasks, onClearOpenTaskDialog]);

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

  const handleGroupByChange = (groupBy: AsanaGroupBy) => {
    if (!filters || !onFiltersChange) return;
    onFiltersChange({ ...filters, groupBy });
  };

  const handleMoveGroup = (groupName: string, direction: 'up' | 'down') => {
    if (!filters || !onFiltersChange || !groupedTasks) return;

    // Get current group names in order
    const currentOrder = groupedTasks.map(([name]) => name);

    // Find current index
    const currentIndex = currentOrder.indexOf(groupName);
    if (currentIndex === -1) return;

    // Calculate new index
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= currentOrder.length) return;

    // Swap positions
    const newOrder = [...currentOrder];
    [newOrder[currentIndex], newOrder[newIndex]] = [newOrder[newIndex], newOrder[currentIndex]];

    // Update filters with new order
    onFiltersChange({ ...filters, groupOrder: newOrder });
  };

  const toggleGroupExpanded = (groupName: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  };

  // Handle drag over a group header
  const handleGroupDragOver = (e: React.DragEvent, groupName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverGroup(groupName);
  };

  // Handle drag leave from a group header
  const handleGroupDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverGroup(null);
  };

  // Handle drop on a group header - change task's Type
  const handleGroupDrop = async (e: React.DragEvent, targetGroupName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverGroup(null);

    if (!onUpdateTask || !typeFieldInfoByIntegration) return;

    try {
      const data = e.dataTransfer.getData('application/json');
      if (!data) return;

      const dragItem: DragItem & { integrationId?: string } = JSON.parse(data);

      // Only handle asana tasks
      if (dragItem.source !== 'asana') return;

      // Get integrationId from drag data or find task
      let integrationId = dragItem.integrationId;
      const taskTitle = dragItem.title;

      if (!integrationId) {
        // Fallback: find the task in our tasks list
        const task = tasks.find(t => t.id === dragItem.id);
        if (!task || !task.integrationId) return;
        integrationId = task.integrationId;
      }

      // Find the task to get its current type (before any optimistic override)
      const task = tasks.find(t => t.id === dragItem.id);
      const typeField = task?.customFields?.find(cf => cf.name.toLowerCase() === 'type');
      const currentType = typeField?.displayValue || 'No Type';

      // Skip if dropping on the same group
      if (currentType === targetGroupName) return;

      // Get type field info for this task's integration
      const typeFieldInfo = typeFieldInfoByIntegration.get(integrationId);
      if (!typeFieldInfo) {
        console.error('No type field info for integration:', integrationId);
        return;
      }

      // Get the enum option GID for the target group
      const enumOptionGid = typeFieldInfo.enumOptions.get(targetGroupName);
      if (!enumOptionGid && targetGroupName !== 'No Type') {
        console.error('No enum option found for type:', targetGroupName);
        return;
      }

      console.log(`[AsanaSidebar] Moving task "${taskTitle}" from "${currentType}" to "${targetGroupName}"`);

      // Optimistically update the UI immediately
      setOptimisticTypeOverrides(prev => {
        const next = new Map(prev);
        next.set(dragItem.id, targetGroupName);
        return next;
      });

      // Update the task's Type custom field in the background
      const updates: UpdateTaskOptions = {
        customFields: { [typeFieldInfo.fieldGid]: enumOptionGid || null }
      };

      // Clear optimistic override after API call completes (success or failure)
      const clearOverride = () => {
        setOptimisticTypeOverrides(prev => {
          const next = new Map(prev);
          next.delete(dragItem.id);
          return next;
        });
      };

      try {
        await onUpdateTask(dragItem.id, integrationId, updates);
        clearOverride();
      } catch (apiErr) {
        console.error('Failed to update task in Asana:', apiErr);
        clearOverride();
      }
    } catch (err) {
      console.error('Failed to handle group drop:', err);
    }
  };

  const handleDragStart = (e: React.DragEvent, task: CalendarEvent) => {
    const dragItem: DragItem & { integrationId?: string } = {
      type: 'asana-task',
      id: task.id,
      source: 'asana',
      title: task.title,
      duration: 30, // Default 30 min duration
      integrationId: task.integrationId,
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
            <h2 className={`font-semibold ${colorScheme?.sidebarHeaderText || 'text-gray-900'}`}>
              {lockedIntegrationId
                ? integrations.find(i => i.id === lockedIntegrationId)?.name || 'Asana Tasks'
                : 'Asana Tasks'}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {onCreateTask && integrations.length > 0 && (
              <button
                onClick={() => setShowCreateTask(true)}
                className="p-1.5 rounded-md transition-colors hover:bg-gray-100 text-gray-500 hover:text-orange-600"
                title="Create new task"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
            {filters && onFiltersChange && (
              <>
                <button
                  onClick={() => { setShowGroupBy(!showGroupBy); setShowSort(false); setShowFilters(false); }}
                  className={`p-1.5 rounded-md transition-colors ${
                    filters.groupBy !== 'none' || showGroupBy
                      ? 'bg-orange-100 text-orange-600'
                      : 'hover:bg-gray-100 text-gray-500'
                  }`}
                  title="Group by"
                >
                  <Layers className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { setShowSort(!showSort); setShowGroupBy(false); setShowFilters(false); }}
                  className={`p-1.5 rounded-md transition-colors ${
                    showSort ? 'bg-orange-100 text-orange-600' : 'hover:bg-gray-100 text-gray-500'
                  }`}
                  title="Sort"
                >
                  <ArrowUpDown className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { setShowFilters(!showFilters); setShowSort(false); setShowGroupBy(false); }}
                  className={`p-1.5 rounded-md transition-colors ${
                    hasActiveFilters || showFilters
                      ? 'bg-orange-100 text-orange-600'
                      : 'hover:bg-gray-100 text-gray-500'
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
          {searchedTasks.length} task{searchedTasks.length !== 1 ? 's' : ''}
          {searchQuery && searchedTasks.length !== tasks.length && (
            <span className="text-gray-400"> (of {tasks.length})</span>
          )}
        </p>

        {/* Group By Panel */}
        {showGroupBy && filters && onFiltersChange && (
          <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
            <label className="text-xs font-medium text-gray-600 block">Group by</label>
            <div className="flex flex-wrap gap-1.5">
              {GROUP_BY_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => handleGroupByChange(option.value)}
                  className={`text-xs px-2 py-1 rounded-full transition-colors ${
                    filters.groupBy === option.value
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

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

            {/* Integration filter (hidden when locked to specific integration) */}
            {integrations.length > 1 && !lockedIntegrationId && (
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

      {/* Search Input */}
      <div className="px-4 pb-3 border-b border-gray-200">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks..."
            className="w-full pl-8 pr-8 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500" />
          </div>
        ) : searchedTasks.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            {searchQuery ? 'No tasks match your search' : 'No incomplete Asana tasks'}
          </div>
        ) : groupedTasks ? (
          // Grouped view
          <div className="p-2 space-y-2">
            {groupedTasks.map(([groupName, groupTasks], index) => {
              const isExpanded = expandedGroups.has(groupName);
              return (
                <div key={groupName}>
                  <div
                    className={`flex items-center gap-2 px-2 py-1.5 sticky top-0 bg-white/95 backdrop-blur-sm z-10 cursor-pointer rounded-md transition-colors ${
                      dragOverGroup === groupName
                        ? 'bg-orange-100 ring-2 ring-orange-400'
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => toggleGroupExpanded(groupName)}
                    onDragOver={(e) => handleGroupDragOver(e, groupName)}
                    onDragLeave={handleGroupDragLeave}
                    onDrop={(e) => handleGroupDrop(e, groupName)}
                  >
                    {/* Expand/collapse chevron */}
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex-1">
                      {groupName}
                    </span>
                    <span className="text-xs text-gray-400">
                      ({groupTasks.length})
                    </span>
                    {/* Reorder buttons */}
                    {onFiltersChange && groupedTasks.length > 1 && (
                      <div className="flex items-center gap-0.5 ml-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveGroup(groupName, 'up');
                          }}
                          disabled={index === 0}
                          className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move up"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveGroup(groupName, 'down');
                          }}
                          disabled={index === groupedTasks.length - 1}
                          className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move down"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  {isExpanded && (
                    <ul className="space-y-1 mt-1">
                      {groupTasks.map(task => (
                        <MemoizedTaskItem
                          key={`${task.integrationId || 'default'}-${task.id}`}
                          task={task}
                          onDragStart={handleDragStart}
                          scheduledDuration={scheduledDurations.get(task.id)}
                          formatDuration={formatDuration}
                          onClick={() => setSelectedTask(task)}
                          isHighlighted={highlightedTaskId === task.id}
                          onComplete={onToggleComplete}
                          onDelete={onDeleteTask}
                          ref={(el) => {
                            if (el) taskRefs.current.set(task.id, el);
                            else taskRefs.current.delete(task.id);
                          }}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          // Flat list view
          <ul ref={listRef} className="p-2 space-y-1">
            {searchedTasks.map(task => (
              <MemoizedTaskItem
                key={`${task.integrationId || 'default'}-${task.id}`}
                task={task}
                onDragStart={handleDragStart}
                scheduledDuration={scheduledDurations.get(task.id)}
                formatDuration={formatDuration}
                onClick={() => setSelectedTask(task)}
                isHighlighted={highlightedTaskId === task.id}
                onComplete={onToggleComplete}
                onDelete={onDeleteTask}
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
          onUpdateTask={onUpdateTask}
          onDeleteTask={onDeleteTask}
          projects={projects}
          typeFieldInfoByIntegration={typeFieldInfoByIntegration}
        />
      )}

      {/* Create Task Modal */}
      {showCreateTask && onCreateTask && (
        <CreateTaskModal
          integrations={integrations}
          projects={projects}
          typeFieldInfoByIntegration={typeFieldInfoByIntegration}
          lockedIntegrationId={lockedIntegrationId}
          onClose={() => setShowCreateTask(false)}
          onCreateTask={onCreateTask}
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
  onUpdateTask?: (taskId: string, integrationId: string, updates: UpdateTaskOptions) => void;
  onDeleteTask?: (taskId: string, integrationId: string) => void;
  projects?: AsanaProject[];
  typeFieldInfoByIntegration?: Map<string, AsanaSidebarTypeFieldInfo>;
}

function getDueDateStyles(dueOn: string): string {
  const date = parseISO(dueOn);
  if (isPast(date) && !isToday(date)) return 'text-red-600 font-medium';
  if (isToday(date)) return 'text-orange-600 font-medium';
  return 'text-gray-900';
}

function TaskDetailDialog({
  task,
  scheduledDuration,
  formatDuration,
  onClose,
  onToggleComplete,
  onAddComment,
  onUpdateTask,
  onDeleteTask,
  projects = [],
  typeFieldInfoByIntegration,
}: TaskDetailDialogProps) {
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [stories, setStories] = useState<AsanaStory[]>([]);
  const [isLoadingStories, setIsLoadingStories] = useState(false);
  const [storiesError, setStoriesError] = useState<string | null>(null);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editDueOn, setEditDueOn] = useState(task.dueOn || '');
  const [editStartOn, setEditStartOn] = useState(task.startOn || '');
  const [editType, setEditType] = useState('');
  const [editProjectIds, setEditProjectIds] = useState<string[]>(task.projects?.map(p => p.gid) || []);
  const wasEditingRef = useRef(false);

  // Get Type custom field info for this task's integration
  const typeFieldInfo = useMemo(() => {
    if (!typeFieldInfoByIntegration || !task.integrationId) return null;
    return typeFieldInfoByIntegration.get(task.integrationId) || null;
  }, [typeFieldInfoByIntegration, task.integrationId]);

  // Available type values for dropdown
  const typeValues = useMemo(() => {
    if (!typeFieldInfo) return [];
    return Array.from(typeFieldInfo.enumOptions.keys()).sort();
  }, [typeFieldInfo]);

  // Filter projects to only those from this task's integration
  const availableProjects = useMemo(() => {
    return projects.filter(p => p.integrationId === task.integrationId);
  }, [projects, task.integrationId]);

  // Get Type custom field
  const typeField = task.customFields?.find(cf => cf.name.toLowerCase() === 'type');

  // Initialize edit fields only when ENTERING edit mode (not on every task prop change)
  useEffect(() => {
    if (isEditing && !wasEditingRef.current) {
      // Just entered edit mode - initialize fields
      setEditType(typeField?.displayValue || '');
      setEditDueOn(task.dueOn || '');
      setEditStartOn(task.startOn || '');
      setEditProjectIds(task.projects?.map(p => p.gid) || []);
    }
    wasEditingRef.current = isEditing;
  }, [isEditing, typeField?.displayValue, task.dueOn, task.startOn, task.projects]);

  // Fetch stories when dialog opens
  useEffect(() => {
    if (task.integrationId) {
      setIsLoadingStories(true);
      setStoriesError(null);
      api.getTaskStories(task.id, task.integrationId)
        .then(({ stories }) => {
          // Filter to only show comments (not system-generated stories)
          const comments = stories.filter(s => s.resourceSubtype === 'comment_added');
          setStories(comments);
        })
        .catch((err) => {
          console.error('Failed to fetch stories:', err);
          setStoriesError('Failed to load comments');
        })
        .finally(() => {
          setIsLoadingStories(false);
        });
    }
  }, [task.id, task.integrationId]);

  // Close dialog on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim() || !onAddComment || !task.integrationId) return;

    setIsSubmitting(true);
    try {
      await onAddComment(task.id, task.integrationId, comment.trim());
      setComment('');
      // Refresh stories to show the new comment
      const { stories } = await api.getTaskStories(task.id, task.integrationId);
      const comments = stories.filter(s => s.resourceSubtype === 'comment_added');
      setStories(comments);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleComplete = () => {
    if (!onToggleComplete || !task.integrationId) return;

    const isCompleting = !task.completed;
    // Optimistic: call handler and close dialog immediately
    onToggleComplete(task.id, task.integrationId, isCompleting);
    // Close the dialog immediately after marking complete (task will disappear from list)
    if (isCompleting) {
      onClose();
    }
  };

  const handleDeleteTask = () => {
    if (!onDeleteTask || !task.integrationId) return;

    // Optimistic: call handler and close dialog immediately
    onDeleteTask(task.id, task.integrationId);
    onClose();
  };

  const handleSaveChanges = () => {
    if (!onUpdateTask || !task.integrationId) return;

    const updates: UpdateTaskOptions = {};

    // Due date
    if (editDueOn !== (task.dueOn || '')) {
      updates.dueOn = editDueOn || null;
    }

    // Start date
    if (editStartOn !== (task.startOn || '')) {
      updates.startOn = editStartOn || null;
    }

    // Type
    if (editType !== (typeField?.displayValue || '')) {
      if (typeFieldInfo && editType) {
        const enumOptionGid = typeFieldInfo.enumOptions.get(editType);
        if (enumOptionGid) {
          updates.customFields = { [typeFieldInfo.fieldGid]: enumOptionGid };
        }
      } else if (typeFieldInfo && !editType) {
        // Clear the type
        updates.customFields = { [typeFieldInfo.fieldGid]: null };
      }
    }

    // Projects
    const currentProjectIds = task.projects?.map(p => p.gid) || [];
    const addProjects = editProjectIds.filter(id => !currentProjectIds.includes(id));
    const removeProjects = currentProjectIds.filter(id => !editProjectIds.includes(id));

    if (addProjects.length > 0) {
      updates.addProjects = addProjects;
    }
    if (removeProjects.length > 0) {
      updates.removeProjects = removeProjects;
    }

    // Only update if there are changes
    if (Object.keys(updates).length > 0) {
      // Optimistic: call handler immediately
      onUpdateTask(task.id, task.integrationId, updates);
      // If type was changed to "NOT A TASK", close the dialog entirely
      // since the task will be filtered out of the view
      if (editType === 'NOT A TASK') {
        onClose();
        return;
      }
    }
    // Exit edit mode immediately
    setIsEditing(false);
    wasEditingRef.current = false;
  };

  const handleProjectToggle = (projectGid: string) => {
    setEditProjectIds(prev =>
      prev.includes(projectGid)
        ? prev.filter(id => id !== projectGid)
        : [...prev, projectGid]
    );
  };

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
            <div className="flex items-center gap-1 flex-shrink-0">
              {onUpdateTask && task.integrationId && !isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1 text-gray-400 hover:text-orange-600 hover:bg-gray-100 rounded"
                  title="Edit task"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Type badge */}
          {typeField?.displayValue && !isEditing && (
            <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
              <Tag className="w-3 h-3" />
              {typeField.displayValue}
            </span>
          )}

          {/* Scheduled duration */}
          {scheduledDuration !== undefined && scheduledDuration > 0 && !isEditing && (
            <span className="inline-flex ml-2 mt-2 bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-xs">
              {formatDuration(scheduledDuration)} scheduled
            </span>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isEditing ? (
            /* Edit Mode Form */
            <div className="space-y-4">
              {/* Type selector */}
              {typeValues.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                    <Tag className="w-3 h-3" /> Type
                  </label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                  >
                    <option value="">No type</option>
                    {typeValues.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Start date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                  <PlayCircle className="w-3 h-3" /> Start date
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={editStartOn}
                    onChange={(e) => setEditStartOn(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none cursor-pointer [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:left-0 [&::-webkit-calendar-picker-indicator]:top-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                  />
                </div>
              </div>

              {/* Due date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Due date
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={editDueOn}
                    onChange={(e) => setEditDueOn(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none cursor-pointer [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:left-0 [&::-webkit-calendar-picker-indicator]:top-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                  />
                </div>
              </div>

              {/* Projects */}
              {availableProjects.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                    <Folder className="w-3 h-3" /> Projects
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-gray-50 rounded-lg border border-gray-200">
                    {availableProjects.map(project => (
                      <button
                        key={project.gid}
                        type="button"
                        onClick={() => handleProjectToggle(project.gid)}
                        className={`text-xs px-2 py-1 rounded-full transition-colors ${
                          editProjectIds.includes(project.gid)
                            ? 'bg-orange-100 text-orange-700 ring-1 ring-orange-300'
                            : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                        }`}
                      >
                        {project.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Save/Cancel buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveChanges}
                  className="flex-1 px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          ) : (
            /* View Mode */
            <>
              {/* Notes/Description */}
              {task.description && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notes</label>
                  <div className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                    <LinkifiedText text={task.description} />
                  </div>
                </div>
              )}

              {/* Parent Task */}
              {task.parentTask && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Parent Task</label>
                  <a
                    href={getAsanaTaskUrl(task.parentTask.gid)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-orange-600 hover:text-orange-700 hover:underline mt-0.5 block truncate"
                  >
                    {task.parentTask.name}
                  </a>
                </div>
              )}

              {/* Task Details Grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {/* Start date */}
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
                    <PlayCircle className="w-3 h-3" /> Start
                  </label>
                  <p className="text-gray-900 mt-0.5">
                    {task.startOn ? format(parseISO(task.startOn), 'MMM d, yyyy') : <span className="text-gray-400 italic">Not set</span>}
                  </p>
                </div>

                {/* Due date */}
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Due
                  </label>
                  {task.dueOn ? (
                    <p className={`mt-0.5 ${getDueDateStyles(task.dueOn)}`}>
                      {format(parseISO(task.dueOn), 'MMM d, yyyy')}
                    </p>
                  ) : (
                    <p className="text-gray-400 italic mt-0.5">Not set</p>
                  )}
                </div>

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

              {/* Comments Section */}
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" /> Comments
                  {stories.length > 0 && (
                    <span className="text-gray-400">({stories.length})</span>
                  )}
                </label>

                {isLoadingStories ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                  </div>
                ) : storiesError ? (
                  <p className="text-sm text-red-500 mt-1">{storiesError}</p>
                ) : stories.length === 0 ? (
                  <p className="text-sm text-gray-500 mt-1 italic">No comments yet</p>
                ) : (
                  <div className="mt-2 space-y-3 max-h-48 overflow-y-auto">
                    {stories.map((story) => (
                      <div key={story.gid} className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-gray-700">
                            {story.createdBy?.name || 'Unknown'}
                          </span>
                          <span className="text-xs text-gray-400">
                            {format(parseISO(story.createdAt), 'MMM d, h:mm a')}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                          <LinkifiedText text={story.text} />
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Actions - fixed at bottom */}
        <div className="p-4 border-t border-gray-200 space-y-3 flex-shrink-0">
          {/* Complete/Reopen button */}
          {onToggleComplete && task.integrationId && (
            <button
              onClick={handleToggleComplete}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors ${
                task.completed
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              <Check className="w-4 h-4" />
              {task.completed ? 'Reopen Task' : 'Mark Complete'}
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

          {/* Delete Task */}
          {onDeleteTask && task.integrationId && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 border border-red-300 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Task
            </button>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Task?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to delete &quot;{task.title}&quot;? This will permanently remove the task from Asana and cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteTask}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Create Task Modal Component
interface CreateTaskModalProps {
  integrations: { id: string; name: string }[];
  projects: AsanaProject[];
  typeFieldInfoByIntegration?: Map<string, AsanaSidebarTypeFieldInfo>;
  lockedIntegrationId?: string;
  onClose: () => void;
  onCreateTask: (integrationId: string, name: string, options?: { notes?: string; dueOn?: string; projectGid?: string; customFields?: Record<string, string> }) => Promise<CalendarEvent | null>;
}

function CreateTaskModal({
  integrations,
  projects,
  typeFieldInfoByIntegration,
  lockedIntegrationId,
  onClose,
  onCreateTask,
}: CreateTaskModalProps) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [selectedIntegration, setSelectedIntegration] = useState(lockedIntegrationId || integrations[0]?.id || '');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get typeFieldInfo for the selected integration
  const typeFieldInfo = useMemo(() => {
    if (!typeFieldInfoByIntegration || !selectedIntegration) return null;
    return typeFieldInfoByIntegration.get(selectedIntegration) || null;
  }, [typeFieldInfoByIntegration, selectedIntegration]);

  // Get type values for the selected integration
  const typeValues = useMemo(() => {
    if (!typeFieldInfo) return [];
    return Array.from(typeFieldInfo.enumOptions.keys()).sort();
  }, [typeFieldInfo]);

  // Type field is always required when type info is available
  const typeRequired = typeFieldInfo && typeValues.length > 0;

  // Filter projects by selected integration
  const filteredProjects = useMemo(() => {
    return projects.filter(p => p.integrationId === selectedIntegration);
  }, [projects, selectedIntegration]);

  // Reset project and type when integration changes
  useEffect(() => {
    setSelectedProject('');
    setSelectedType('');
  }, [selectedIntegration]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !selectedIntegration) return;

    // Type field is mandatory for all task creation
    if (typeRequired && !selectedType) {
      setError('Type field is required - please select a type for this task');
      return;
    }
    
    // Also check if we're creating for OM integration but don't have type info
    if (selectedIntegration === 'cced5243-26a4-447f-bd1e-1e202ebe5130' && !typeRequired) {
      setError('Type configuration missing for OM integration');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const options: { notes?: string; dueOn?: string; projectGid?: string; customFields?: Record<string, string> } = {};
      if (notes.trim()) options.notes = notes.trim();
      if (dueOn) options.dueOn = dueOn;
      if (selectedProject) options.projectGid = selectedProject;

      // Add custom field for Type if selected
      if (selectedType && typeFieldInfo) {
        const enumOptionGid = typeFieldInfo.enumOptions.get(selectedType);
        if (enumOptionGid) {
          options.customFields = {
            [typeFieldInfo.fieldGid]: enumOptionGid,
          };
        }
      }

      await onCreateTask(selectedIntegration, name.trim(), options);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Create Asana Task</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Integration selector (hidden when locked) */}
          {integrations.length > 1 && !lockedIntegrationId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Workspace
              </label>
              <select
                value={selectedIntegration}
                onChange={(e) => setSelectedIntegration(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
              >
                {integrations.map(int => (
                  <option key={int.id} value={int.id}>{int.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Task name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Task name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter task name"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
              autoFocus
              required
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes (optional)"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none resize-none"
            />
          </div>

          {/* Due date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Due date
            </label>
            <div className="relative">
              <input
                type="date"
                value={dueOn}
                onChange={(e) => setDueOn(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none cursor-pointer [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:left-0 [&::-webkit-calendar-picker-indicator]:top-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
              />
            </div>
          </div>

          {/* Project selector */}
          {filteredProjects.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Project
              </label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
              >
                <option value="">No project</option>
                {filteredProjects.map(project => (
                  <option key={project.gid} value={project.gid}>{project.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Type selector */}
          {typeValues.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                required={true}
              >
                <option value="">Select type (required)</option>
                {typeValues.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSubmitting}
              className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
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
  onComplete?: (taskId: string, integrationId: string, completed: boolean) => void;
  onDelete?: (taskId: string, integrationId: string) => void;
}

const MemoizedTaskItem = memo(
  forwardRef<HTMLLIElement, TaskItemProps>(function TaskItem(
    { task, onDragStart, scheduledDuration, formatDuration, onClick, isHighlighted, onComplete, onDelete },
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
