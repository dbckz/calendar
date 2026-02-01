'use client';

import { useCallback, useEffect, useRef } from 'react';
import { CalendarEvent, AdHocTask } from '@/types';
import { subDays, addDays } from 'date-fns';
import { useGoogleCalendar } from './useGoogleCalendar';
import { useAsanaTasks } from './useAsanaTasks';

export function useCalendarEvents() {
  const hasFetched = useRef(false);

  const {
    googleEvents,
    isLoading: googleLoading,
    error: googleError,
    fetchGoogleEventsForDates,
    updateGoogleEvent: updateGoogleEventInternal,
    createGoogleEvent: createGoogleEventInternal,
    deleteGoogleEvent: deleteGoogleEventInternal,
  } = useGoogleCalendar();

  const {
    allAsanaTasks,
    filteredAsanaTasks,
    scheduledAsanaTasks,
    isLoading: asanaLoading,
    error: asanaError,
    projects: asanaProjects,
    typeValues: asanaTypeValues,
    typeFieldInfoByIntegration: asanaTypeFieldInfoByIntegration,
    integrations: asanaIntegrations,
    filters: asanaFilters,
    filtersMap: asanaFiltersMap,
    setFilters: setAsanaFilters,
    getFiltersForIntegration: getAsanaFiltersForIntegration,
    clearFilters: clearAsanaFilters,
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
  } = useAsanaTasks();

  const isLoading = googleLoading || asanaLoading;
  const error = googleError || asanaError;

  const fetchAllEvents = useCallback(async () => {
    const today = new Date();
    const yesterday = subDays(today, 1);
    const tomorrow = addDays(today, 1);

    await Promise.all([
      fetchGoogleEventsForDates([yesterday, today, tomorrow]),
      fetchAllAsanaTasks(),
    ]);
  }, [fetchGoogleEventsForDates, fetchAllAsanaTasks]);

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      fetchAllEvents();
    }
  }, [fetchAllEvents]);

  const adhocToCalendarEvent = useCallback((task: AdHocTask): CalendarEvent => {
    let startTime: Date;
    if (task.dueDate) {
      startTime = new Date(task.dueDate);
      if (task.dueTime) {
        const [hours, minutes] = task.dueTime.split(':').map(Number);
        startTime.setHours(hours, minutes, 0, 0);
      } else {
        startTime.setHours(9, 0, 0, 0);
      }
    } else {
      startTime = new Date();
      startTime.setHours(9, 0, 0, 0);
    }

    const duration = task.duration || 30;
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

    const priorityColors = {
      low: '#22c55e',
      medium: '#eab308',
      high: '#ef4444',
    };

    return {
      id: task.id,
      title: task.title,
      description: task.description,
      startTime,
      endTime,
      source: 'adhoc',
      color: priorityColors[task.priority],
      completed: task.completed,
    };
  }, []);

  const updateGoogleEvent = useCallback(
    (eventId: string, integrationId: string, startTime: Date, endTime: Date, title?: string, description?: string) =>
      updateGoogleEventInternal(eventId, integrationId, startTime, endTime, title, description),
    [updateGoogleEventInternal]
  );

  const createGoogleEvent = useCallback(
    async (integrationId: string, title: string, startTime: Date, endTime: Date, description?: string): Promise<CalendarEvent | null> => {
      const result = await createGoogleEventInternal(integrationId, title, startTime, endTime, description);
      return result.event;
    },
    [createGoogleEventInternal]
  );

  const deleteGoogleEvent = useCallback(
    async (eventId: string, integrationId: string): Promise<boolean> => {
      const result = await deleteGoogleEventInternal(eventId, integrationId);
      return result.success;
    },
    [deleteGoogleEventInternal]
  );

  return {
    googleEvents,
    allAsanaTasks,
    filteredAsanaTasks,
    scheduledAsanaTasks,
    isLoading,
    error,
    asanaProjects,
    asanaTypeValues,
    asanaTypeFieldInfoByIntegration,
    asanaIntegrations,
    asanaFilters,
    asanaFiltersMap,
    setAsanaFilters,
    getAsanaFiltersForIntegration,
    clearAsanaFilters,
    fetchAllEvents,
    adhocToCalendarEvent,
    scheduleAsana,
    updateScheduledAsana,
    updateScheduledAsanaByGoogleEvent,
    unscheduleAsana,
    unscheduleAllAsanaInstances,
    updateGoogleEvent,
    createGoogleEvent,
    deleteGoogleEvent,
    getScheduledAsanaEventsForDate,
    completeAsanaTask,
    addAsanaComment,
    createAsanaTask,
    updateAsanaTask,
    deleteAsanaTask,
  };
}
