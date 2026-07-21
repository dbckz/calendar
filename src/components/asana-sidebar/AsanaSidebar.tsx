'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { CalendarEvent, DragItem, AsanaDateFilter, AsanaSortField, AsanaFilterLogic, AsanaGroupBy } from '@/types';
import { Filter, X, ChevronDown, ChevronUp, ChevronRight, ArrowUpDown, Clock, Folder, Tag, PlayCircle, Plus, Loader2, Layers, Search, Bot } from 'lucide-react';
import { api } from '@/lib/api';
import { CreateAsanaTaskModal } from '../CreateAsanaTaskModal';
import { TaskDetailDialog } from './TaskDetailDialog';
import { MemoizedTaskItem } from './TaskItem';
import { DATE_FILTER_OPTIONS, SORT_OPTIONS, GROUP_BY_OPTIONS } from './constants';
import { UpdateTaskOptions, AsanaSidebarProps } from './types';

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
  taskMetadata,
  onSaveTaskMetadata,
  delegation,
  onDelegated,
}: AsanaSidebarProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  // Bulk-select for "Queue all" delegation.
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedForBulk, setSelectedForBulk] = useState<Set<string>>(new Set());
  const [isBulkQueuing, setIsBulkQueuing] = useState(false);

  const toggleBulkSelect = useCallback((taskId: string) => {
    setSelectedForBulk(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const exitBulkMode = useCallback(() => {
    setBulkMode(false);
    setSelectedForBulk(new Set());
  }, []);

  const handleBulkQueue = useCallback(async () => {
    const selected = tasks.filter(t => selectedForBulk.has(t.id) && t.integrationId);
    if (selected.length === 0) return;
    setIsBulkQueuing(true);
    try {
      // Enqueue each with an empty brief (edit per-task later); background mode.
      await Promise.all(selected.map(t =>
        api.upsertDelegationEntry(t.id, t.integrationId!, {
          title: t.title,
          mode: 'background',
          state: 'queued',
        })
      ));
      onDelegated?.();
      exitBulkMode();
    } catch (err) {
      console.error('Failed to bulk-queue tasks:', err);
    } finally {
      setIsBulkQueuing(false);
    }
  }, [tasks, selectedForBulk, onDelegated, exitBulkMode]);
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

      {/* Bulk delegation toolbar */}
      {onDelegated && searchedTasks.length > 0 && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 text-xs">
          {bulkMode ? (
            <>
              <span className="text-gray-600">{selectedForBulk.size} selected</span>
              <div className="flex items-center gap-2">
                <button onClick={exitBulkMode} className="text-gray-500 hover:text-gray-700">Cancel</button>
                <button
                  onClick={handleBulkQueue}
                  disabled={selectedForBulk.size === 0 || isBulkQueuing}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isBulkQueuing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3" />}
                  Queue {selectedForBulk.size || ''}
                </button>
              </div>
            </>
          ) : (
            <button onClick={() => setBulkMode(true)} className="ml-auto flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800">
              <Bot className="w-3 h-3" /> Queue several…
            </button>
          )}
        </div>
      )}

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
                          metadata={taskMetadata?.[task.id]}
                          bulkMode={bulkMode}
                          isSelected={selectedForBulk.has(task.id)}
                          onToggleSelect={toggleBulkSelect}
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
                metadata={taskMetadata?.[task.id]}
                bulkMode={bulkMode}
                isSelected={selectedForBulk.has(task.id)}
                onToggleSelect={toggleBulkSelect}
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
          metadata={taskMetadata?.[selectedTask.id]}
          onSaveMetadata={onSaveTaskMetadata}
          delegationEntry={delegation?.[selectedTask.id]}
          onDelegated={onDelegated}
        />
      )}

      {/* Create Task Modal */}
      {showCreateTask && onCreateTask && (
        <CreateAsanaTaskModal
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
