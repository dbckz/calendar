'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { CalendarEvent, ScheduledAsanaTask, AsanaProject, AsanaFilterState, AsanaDateFilter } from '@/types';
import { api, parseCalendarEvents, ApiRequestError } from '@/lib/api';
import { isToday, isPast, isThisWeek, parseISO, compareAsc, compareDesc } from 'date-fns';

interface CreateAsanaTaskOptions {
  notes?: string;
  dueOn?: string;
  projectGid?: string;
  customFields?: Record<string, string>; // fieldGid -> enumOptionGid
}

interface UpdateAsanaTaskOptions {
  dueOn?: string | null;
  startOn?: string | null;
  customFields?: Record<string, string | null>;
  addProjects?: string[];
  removeProjects?: string[];
}

interface TypeFieldInfo {
  fieldGid: string;
  enumOptions: Map<string, string>; // displayValue -> enumOptionGid
}

interface UseAsanaTasksReturn {
  allAsanaTasks: CalendarEvent[];
  filteredAsanaTasks: CalendarEvent[];
  scheduledAsanaTasks: ScheduledAsanaTask[];
  isLoading: boolean;
  error: string | null;
  // Filter state
  projects: AsanaProject[];
  typeValues: string[]; // Unique type values from tasks
  typeFieldInfoByIntegration: Map<string, TypeFieldInfo>; // Info for setting Type field on new tasks, per integration
  integrations: { id: string; name: string }[]; // Unique integrations from tasks
  filters: AsanaFilterState;
  setFilters: (filters: AsanaFilterState) => void;
  clearFilters: () => void;
  // Actions
  fetchAllAsanaTasks: () => Promise<void>;
  scheduleAsana: (
    asanaTaskId: string,
    integrationId: string | undefined,
    scheduledDate: string,
    scheduledTime: string,
    duration: number,
    googleEventId?: string,
    googleIntegrationId?: string
  ) => Promise<ScheduledAsanaTask | null>;
  updateScheduledAsana: (
    scheduleId: string,
    updates: Partial<ScheduledAsanaTask>
  ) => Promise<ScheduledAsanaTask | null>;
  updateScheduledAsanaByGoogleEvent: (
    googleEventId: string,
    updates: Partial<ScheduledAsanaTask>
  ) => Promise<ScheduledAsanaTask | null>;
  unscheduleAsana: (scheduleId: string) => Promise<boolean>;
  unscheduleAllAsanaInstances: (asanaTaskId: string) => Promise<boolean>;
  getScheduledAsanaEventsForDate: (date: string) => CalendarEvent[];
  completeAsanaTask: (taskId: string, integrationId: string, completed: boolean) => Promise<void>;
  addAsanaComment: (taskId: string, integrationId: string, comment: string) => Promise<void>;
  createAsanaTask: (integrationId: string, name: string, options?: CreateAsanaTaskOptions) => Promise<CalendarEvent | null>;
  updateAsanaTask: (taskId: string, integrationId: string, updates: UpdateAsanaTaskOptions) => Promise<CalendarEvent | null>;
  deleteAsanaTask: (taskId: string, integrationId: string) => Promise<boolean>;
}

const DEFAULT_FILTERS: AsanaFilterState = {
  integrationIds: [],
  projectIds: [],
  typeValues: [],
  dueDateRange: 'all',
  startDateRange: 'all',
  filterLogic: 'and',
  sortField: 'dueOn',
  sortDirection: 'asc',
  groupBy: 'none',
  groupOrder: [],
};

const FILTERS_STORAGE_KEY = 'asana-filters';

// Load filters from localStorage
function loadFiltersFromStorage(): AsanaFilterState {
  if (typeof window === 'undefined') return DEFAULT_FILTERS;
  try {
    const stored = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults to handle any new filter fields
      return { ...DEFAULT_FILTERS, ...parsed };
    }
  } catch (e) {
    console.error('Failed to load filters from storage:', e);
  }
  return DEFAULT_FILTERS;
}

// Save filters to localStorage
function saveFiltersToStorage(filters: AsanaFilterState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
  } catch (e) {
    console.error('Failed to save filters to storage:', e);
  }
}

// Helper to get "Type" custom field value from a task
function getTaskTypeValue(task: CalendarEvent): string | null {
  const typeField = task.customFields?.find(
    cf => cf.name.toLowerCase() === 'type'
  );
  return typeField?.displayValue || null;
}

// Helper to check if date matches filter
function matchesDateFilter(dateStr: string | undefined, filter: AsanaDateFilter): boolean {
  if (filter === 'all') return true;

  const date = dateStr ? parseISO(dateStr) : null;

  switch (filter) {
    case 'no_date':
      return date === null;
    case 'overdue':
      return date !== null && isPast(date) && !isToday(date);
    case 'today':
      return date !== null && isToday(date);
    case 'this_week':
      return date !== null && isThisWeek(date);
    default:
      return true;
  }
}

export function useAsanaTasks(): UseAsanaTasksReturn {
  const [allAsanaTasks, setAllAsanaTasks] = useState<CalendarEvent[]>([]);
  const [scheduledAsanaTasks, setScheduledAsanaTasks] = useState<ScheduledAsanaTask[]>([]);
  const [filters, setFiltersState] = useState<AsanaFilterState>(DEFAULT_FILTERS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load filters from localStorage on mount
  useEffect(() => {
    setFiltersState(loadFiltersFromStorage());
  }, []);

  // Wrapper to save filters to localStorage when they change
  const setFilters = useCallback((newFilters: AsanaFilterState) => {
    setFiltersState(newFilters);
    saveFiltersToStorage(newFilters);
  }, []);

  // Load scheduled Asana tasks from server
  useEffect(() => {
    api.getScheduledAsanaTasks()
      .then(({ tasks }) => setScheduledAsanaTasks(tasks))
      .catch(error => console.error('Failed to load scheduled asana tasks:', error));
  }, []);

  const fetchAllAsanaTasks = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const tasks = await api.getAllAsanaTasks();
      const parsedTasks = parseCalendarEvents(tasks);
      // Filter out tasks with Type = "NOT A TASK"
      const filteredTasks = parsedTasks.filter(task => {
        const typeValue = getTaskTypeValue(task);
        return typeValue !== 'NOT A TASK';
      });
      setAllAsanaTasks(filteredTasks);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        setAllAsanaTasks([]);
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to fetch Asana tasks');
      setAllAsanaTasks([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Extract unique projects from all tasks
  const projects = useMemo(() => {
    const projectMap = new Map<string, AsanaProject>();
    allAsanaTasks.forEach(task => {
      if (task.projects) {
        task.projects.forEach(project => {
          if (!projectMap.has(project.gid)) {
            projectMap.set(project.gid, {
              gid: project.gid,
              name: project.name,
              integrationId: task.integrationId || '',
              integrationName: task.integrationName || '',
            });
          }
        });
      }
    });
    return Array.from(projectMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allAsanaTasks]);

  // Extract unique type values from all tasks
  const typeValues = useMemo(() => {
    const types = new Set<string>();
    allAsanaTasks.forEach(task => {
      const typeValue = getTaskTypeValue(task);
      if (typeValue) types.add(typeValue);
    });
    return Array.from(types).sort();
  }, [allAsanaTasks]);

  // Extract Type custom field info per integration (fieldGid and displayValue -> enumOptionGid mapping)
  // Custom fields are workspace-specific, so we track them per integration
  const typeFieldInfoByIntegration = useMemo(() => {
    const infoMap = new Map<string, { fieldGid: string; enumOptions: Map<string, string> }>();

    for (const task of allAsanaTasks) {
      if (!task.integrationId) continue;

      const typeField = task.customFields?.find(cf => cf.name.toLowerCase() === 'type');
      if (typeField) {
        if (!infoMap.has(task.integrationId)) {
          infoMap.set(task.integrationId, {
            fieldGid: typeField.gid,
            enumOptions: new Map<string, string>(),
          });
        }

        const info = infoMap.get(task.integrationId)!;
        if (typeField.displayValue && typeField.enumValueGid) {
          info.enumOptions.set(typeField.displayValue, typeField.enumValueGid);
        }
      }
    }

    return infoMap;
  }, [allAsanaTasks]);

  // Extract unique integrations from all tasks
  const integrations = useMemo(() => {
    const integrationMap = new Map<string, string>();
    allAsanaTasks.forEach(task => {
      if (task.integrationId && task.integrationName && !integrationMap.has(task.integrationId)) {
        integrationMap.set(task.integrationId, task.integrationName);
      }
    });
    return Array.from(integrationMap.entries()).map(([id, name]) => ({ id, name }));
  }, [allAsanaTasks]);

  // Filter and sort tasks based on current filters
  const filteredAsanaTasks = useMemo(() => {
    // Filter tasks
    const filtered = allAsanaTasks.filter(task => {
      // Always exclude completed tasks
      if (task.completed) return false;

      const conditions: boolean[] = [];

      // Filter by integration
      if (filters.integrationIds.length > 0) {
        conditions.push(
          task.integrationId !== undefined && filters.integrationIds.includes(task.integrationId)
        );
      }

      // Filter by project
      if (filters.projectIds.length > 0) {
        const taskProjectIds = task.projects?.map(p => p.gid) || [];
        conditions.push(
          filters.projectIds.some(pid => taskProjectIds.includes(pid))
        );
      }

      // Filter by Type custom field
      if (filters.typeValues.length > 0) {
        const taskType = getTaskTypeValue(task);
        conditions.push(
          taskType !== null && filters.typeValues.includes(taskType)
        );
      }

      // Filter by due date
      if (filters.dueDateRange !== 'all') {
        conditions.push(matchesDateFilter(task.dueOn, filters.dueDateRange));
      }

      // Filter by start date
      if (filters.startDateRange !== 'all') {
        conditions.push(matchesDateFilter(task.startOn, filters.startDateRange));
      }

      // If no conditions, include the task
      if (conditions.length === 0) return true;

      // Apply AND/OR logic
      if (filters.filterLogic === 'and') {
        return conditions.every(c => c);
      } else {
        return conditions.some(c => c);
      }
    });

    // Sort tasks
    return filtered.sort((a, b) => {
      const direction = filters.sortDirection === 'asc' ? 1 : -1;

      switch (filters.sortField) {
        case 'title':
          return direction * a.title.localeCompare(b.title);

        case 'dueOn': {
          if (!a.dueOn && !b.dueOn) return 0;
          if (!a.dueOn) return direction; // No date goes to end for asc
          if (!b.dueOn) return -direction;
          return direction * compareAsc(parseISO(a.dueOn), parseISO(b.dueOn));
        }

        case 'startOn': {
          if (!a.startOn && !b.startOn) return 0;
          if (!a.startOn) return direction;
          if (!b.startOn) return -direction;
          return direction * compareAsc(parseISO(a.startOn), parseISO(b.startOn));
        }

        case 'createdAt': {
          if (!a.createdAt && !b.createdAt) return 0;
          if (!a.createdAt) return direction;
          if (!b.createdAt) return -direction;
          return direction * compareAsc(parseISO(a.createdAt), parseISO(b.createdAt));
        }

        case 'type': {
          const typeA = getTaskTypeValue(a) || '';
          const typeB = getTaskTypeValue(b) || '';
          return direction * typeA.localeCompare(typeB);
        }

        default:
          return 0;
      }
    });
  }, [allAsanaTasks, filters]);

  const clearFilters = useCallback(() => {
    setFiltersState(DEFAULT_FILTERS);
    saveFiltersToStorage(DEFAULT_FILTERS);
  }, []);

  const scheduleAsana = useCallback(async (
    asanaTaskId: string,
    integrationId: string | undefined,
    scheduledDate: string,
    scheduledTime: string,
    duration: number,
    googleEventId?: string,
    googleIntegrationId?: string
  ): Promise<ScheduledAsanaTask | null> => {
    try {
      const { scheduled } = await api.scheduleAsanaTask(
        asanaTaskId,
        integrationId,
        scheduledDate,
        scheduledTime,
        duration,
        googleEventId,
        googleIntegrationId
      );
      setScheduledAsanaTasks(prev => [...prev, scheduled]);
      return scheduled;
    } catch (error) {
      console.error('Failed to schedule asana task:', error);
      return null;
    }
  }, []);

  const updateScheduledAsana = useCallback(async (
    scheduleId: string,
    updates: Partial<ScheduledAsanaTask>
  ): Promise<ScheduledAsanaTask | null> => {
    try {
      const { schedule: updated } = await api.updateScheduledAsanaTask(scheduleId, updates);
      setScheduledAsanaTasks(prev => prev.map(s => s.id === scheduleId ? updated : s));
      return updated;
    } catch (error) {
      console.error('Failed to update scheduled asana task:', error);
      return null;
    }
  }, []);

  const updateScheduledAsanaByGoogleEvent = useCallback(async (
    googleEventId: string,
    updates: Partial<ScheduledAsanaTask>
  ): Promise<ScheduledAsanaTask | null> => {
    try {
      const { schedule: updated } = await api.updateScheduledAsanaTaskByGoogleEvent(googleEventId, updates);
      setScheduledAsanaTasks(prev => prev.map(s => s.googleEventId === googleEventId ? updated : s));
      return updated;
    } catch (error) {
      console.error('Failed to update scheduled asana task by google event:', error);
      return null;
    }
  }, []);

  const unscheduleAsana = useCallback(async (scheduleId: string): Promise<boolean> => {
    try {
      await api.unscheduleAsanaTask(scheduleId);
      setScheduledAsanaTasks(prev => prev.filter(s => s.id !== scheduleId));
      return true;
    } catch (error) {
      console.error('Failed to unschedule asana task:', error);
      return false;
    }
  }, []);

  const unscheduleAllAsanaInstances = useCallback(async (asanaTaskId: string): Promise<boolean> => {
    try {
      await api.unscheduleAllAsanaTaskInstances(asanaTaskId);
      setScheduledAsanaTasks(prev => prev.filter(s => s.asanaTaskId !== asanaTaskId));
      return true;
    } catch (error) {
      console.error('Failed to unschedule all asana task instances:', error);
      return false;
    }
  }, []);

  const getScheduledAsanaEventsForDate = useCallback((date: string): CalendarEvent[] => {
    const scheduled = scheduledAsanaTasks.filter(s => s.scheduledDate === date);
    const events: CalendarEvent[] = [];

    for (const s of scheduled) {
      const asanaTask = allAsanaTasks.find(t => t.id === s.asanaTaskId);
      if (!asanaTask) continue;

      const [hours, minutes] = s.scheduledTime.split(':').map(Number);
      const startTime = new Date(s.scheduledDate);
      startTime.setHours(hours, minutes, 0, 0);
      const endTime = new Date(startTime.getTime() + s.duration * 60 * 1000);

      events.push({
        ...asanaTask,
        id: s.id, // Use schedule ID as event ID (allows multiple instances)
        linkedAsanaTaskId: s.asanaTaskId, // Keep reference to original Asana task
        startTime,
        endTime,
      });
    }

    return events;
  }, [scheduledAsanaTasks, allAsanaTasks]);

  const completeAsanaTask = useCallback(async (
    taskId: string,
    integrationId: string,
    completed: boolean
  ) => {
    await api.completeAsanaTask(taskId, integrationId, completed);
    // Update local state
    setAllAsanaTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, completed } : t
    ));
  }, []);

  const addAsanaComment = useCallback(async (
    taskId: string,
    integrationId: string,
    comment: string
  ) => {
    await api.addAsanaComment(taskId, integrationId, comment);
  }, []);

  const createAsanaTask = useCallback(async (
    integrationId: string,
    name: string,
    options?: CreateAsanaTaskOptions
  ): Promise<CalendarEvent | null> => {
    try {
      const result = await api.createAsanaTask(integrationId, name, options);
      if (result.success && result.task) {
        const newTask: CalendarEvent = {
          ...result.task,
          startTime: new Date(result.task.startTime),
          endTime: new Date(result.task.endTime),
        };
        // Add to local state
        setAllAsanaTasks(prev => [...prev, newTask]);
        return newTask;
      }
      return null;
    } catch (error) {
      console.error('Failed to create Asana task:', error);
      throw error;
    }
  }, []);

  const updateAsanaTask = useCallback(async (
    taskId: string,
    integrationId: string,
    updates: UpdateAsanaTaskOptions
  ): Promise<CalendarEvent | null> => {
    try {
      const result = await api.updateAsanaTask(taskId, integrationId, updates);
      if (result.success && result.task) {
        const updatedTask: CalendarEvent = {
          ...result.task,
          startTime: new Date(result.task.startTime),
          endTime: new Date(result.task.endTime),
        };
        // Update local state
        setAllAsanaTasks(prev => prev.map(t =>
          t.id === taskId ? updatedTask : t
        ));
        return updatedTask;
      }
      return null;
    } catch (error) {
      console.error('Failed to update Asana task:', error);
      throw error;
    }
  }, []);

  const deleteAsanaTask = useCallback(async (
    taskId: string,
    integrationId: string
  ): Promise<boolean> => {
    try {
      await api.deleteAsanaTask(taskId, integrationId);
      // Remove from local state
      setAllAsanaTasks(prev => prev.filter(t => t.id !== taskId));
      return true;
    } catch (error) {
      console.error('Failed to delete Asana task:', error);
      throw error;
    }
  }, []);

  return {
    allAsanaTasks,
    filteredAsanaTasks,
    scheduledAsanaTasks,
    isLoading,
    error,
    // Filter state
    projects,
    typeValues,
    typeFieldInfoByIntegration,
    integrations,
    filters,
    setFilters,
    clearFilters,
    // Actions
    fetchAllAsanaTasks,
    scheduleAsana,
    updateScheduledAsana,
    updateScheduledAsanaByGoogleEvent,
    unscheduleAsana,
    unscheduleAllAsanaInstances,
    getScheduledAsanaEventsForDate,
    completeAsanaTask,
    addAsanaComment,
    createAsanaTask,
    updateAsanaTask,
    deleteAsanaTask,
  };
}
