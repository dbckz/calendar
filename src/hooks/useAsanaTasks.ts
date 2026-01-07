'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { CalendarEvent, ScheduledAsanaTask, AsanaProject, AsanaFilterState, AsanaDueDateFilter } from '@/types';
import { api, parseCalendarEvents, ApiRequestError } from '@/lib/api';
import {
  getScheduledAsanaTasks,
  scheduleAsanaTask,
  updateScheduledAsanaTask,
  updateScheduledAsanaTaskByGoogleEvent,
  unscheduleAsanaTask,
  unscheduleAllAsanaTaskInstances,
} from '@/lib/storage';
import { isToday, isPast, isThisWeek, parseISO } from 'date-fns';

interface UseAsanaTasksReturn {
  allAsanaTasks: CalendarEvent[];
  filteredAsanaTasks: CalendarEvent[];
  scheduledAsanaTasks: ScheduledAsanaTask[];
  isLoading: boolean;
  error: string | null;
  // Filter state
  projects: AsanaProject[];
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
  ) => ScheduledAsanaTask;
  updateScheduledAsana: (
    scheduleId: string,
    updates: Partial<ScheduledAsanaTask>
  ) => ScheduledAsanaTask | null;
  updateScheduledAsanaByGoogleEvent: (
    googleEventId: string,
    updates: Partial<ScheduledAsanaTask>
  ) => ScheduledAsanaTask | null;
  unscheduleAsana: (scheduleId: string) => boolean;
  unscheduleAllAsanaInstances: (asanaTaskId: string) => boolean;
  getScheduledAsanaEventsForDate: (date: string) => CalendarEvent[];
  completeAsanaTask: (taskId: string, integrationId: string, completed: boolean) => Promise<void>;
  addAsanaComment: (taskId: string, integrationId: string, comment: string) => Promise<void>;
}

const DEFAULT_FILTERS: AsanaFilterState = {
  integrationIds: [],
  projectIds: [],
  dueDateRange: 'all',
};

export function useAsanaTasks(): UseAsanaTasksReturn {
  const [allAsanaTasks, setAllAsanaTasks] = useState<CalendarEvent[]>([]);
  const [scheduledAsanaTasks, setScheduledAsanaTasks] = useState<ScheduledAsanaTask[]>([]);
  const [projects, setProjects] = useState<AsanaProject[]>([]);
  const [filters, setFilters] = useState<AsanaFilterState>(DEFAULT_FILTERS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load scheduled Asana tasks from localStorage
  useEffect(() => {
    setScheduledAsanaTasks(getScheduledAsanaTasks());
  }, []);

  // Fetch projects when tasks are loaded
  const fetchProjects = useCallback(async () => {
    try {
      const { projects: fetchedProjects } = await api.getAsanaProjects();
      setProjects(fetchedProjects);
    } catch (err) {
      console.error('Failed to fetch Asana projects:', err);
    }
  }, []);

  const fetchAllAsanaTasks = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const tasks = await api.getAllAsanaTasks();
      setAllAsanaTasks(parseCalendarEvents(tasks));
      // Also fetch projects
      fetchProjects();
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
  }, [fetchProjects]);

  // Filter tasks based on current filters
  const filteredAsanaTasks = useMemo(() => {
    return allAsanaTasks.filter(task => {
      // Filter by integration
      if (filters.integrationIds.length > 0) {
        if (!task.integrationId || !filters.integrationIds.includes(task.integrationId)) {
          return false;
        }
      }

      // Filter by project - need to check task's projects array
      // Note: projects info is stored in task metadata (from API response)
      if (filters.projectIds.length > 0) {
        // Tasks don't have projects array in CalendarEvent type, so we skip this filter for now
        // This would require extending the CalendarEvent type or using a different approach
      }

      // Filter by due date
      if (filters.dueDateRange !== 'all') {
        const dueDate = task.dueOn ? parseISO(task.dueOn) : null;

        switch (filters.dueDateRange) {
          case 'no_date':
            if (dueDate !== null) return false;
            break;
          case 'overdue':
            if (!dueDate || !isPast(dueDate) || isToday(dueDate)) return false;
            break;
          case 'today':
            if (!dueDate || !isToday(dueDate)) return false;
            break;
          case 'this_week':
            if (!dueDate || !isThisWeek(dueDate)) return false;
            break;
        }
      }

      return true;
    });
  }, [allAsanaTasks, filters]);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const scheduleAsana = useCallback((
    asanaTaskId: string,
    integrationId: string | undefined,
    scheduledDate: string,
    scheduledTime: string,
    duration: number,
    googleEventId?: string,
    googleIntegrationId?: string
  ) => {
    const scheduled = scheduleAsanaTask(asanaTaskId, integrationId, scheduledDate, scheduledTime, duration, googleEventId, googleIntegrationId);
    setScheduledAsanaTasks(getScheduledAsanaTasks());
    return scheduled;
  }, []);

  const updateScheduledAsana = useCallback((
    scheduleId: string,
    updates: Partial<ScheduledAsanaTask>
  ) => {
    const updated = updateScheduledAsanaTask(scheduleId, updates);
    setScheduledAsanaTasks(getScheduledAsanaTasks());
    return updated;
  }, []);

  const updateScheduledAsanaByGoogleEvent = useCallback((
    googleEventId: string,
    updates: Partial<ScheduledAsanaTask>
  ) => {
    const updated = updateScheduledAsanaTaskByGoogleEvent(googleEventId, updates);
    setScheduledAsanaTasks(getScheduledAsanaTasks());
    return updated;
  }, []);

  const unscheduleAsana = useCallback((scheduleId: string) => {
    const result = unscheduleAsanaTask(scheduleId);
    setScheduledAsanaTasks(getScheduledAsanaTasks());
    return result;
  }, []);

  const unscheduleAllAsanaInstances = useCallback((asanaTaskId: string) => {
    const result = unscheduleAllAsanaTaskInstances(asanaTaskId);
    setScheduledAsanaTasks(getScheduledAsanaTasks());
    return result;
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

  return {
    allAsanaTasks,
    filteredAsanaTasks,
    scheduledAsanaTasks,
    isLoading,
    error,
    // Filter state
    projects,
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
  };
}
