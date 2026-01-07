'use client';

import { useCallback, useEffect, useRef } from 'react';
import { CalendarEvent, AdHocTask } from '@/types';
import { subDays, addDays } from 'date-fns';
import { useGoogleCalendar } from './useGoogleCalendar';
import { useAsanaTasks } from './useAsanaTasks';

/**
 * Combined hook for managing all calendar events.
 * Composes useGoogleCalendar and useAsanaTasks for a unified API.
 */
export function useCalendarEvents() {
  const hasFetched = useRef(false);

  // Use the smaller focused hooks
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
    // Filter state
    projects: asanaProjects,
    typeValues: asanaTypeValues,
    integrations: asanaIntegrations,
    filters: asanaFilters,
    setFilters: setAsanaFilters,
    clearFilters: clearAsanaFilters,
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
    deleteAsanaTask,
  } = useAsanaTasks();

  // Combined loading and error state
  const isLoading = googleLoading || asanaLoading;
  const error = googleError || asanaError;

  // Fetch all events for yesterday, today, and tomorrow
  const fetchAllEvents = useCallback(async () => {
    const today = new Date();
    const yesterday = subDays(today, 1);
    const tomorrow = addDays(today, 1);

    await Promise.all([
      fetchGoogleEventsForDates([yesterday, today, tomorrow]),
      fetchAllAsanaTasks(),
    ]);
  }, [fetchGoogleEventsForDates, fetchAllAsanaTasks]);

  // Fetch on mount
  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      fetchAllEvents();
    }
  }, [fetchAllEvents]);

  // Convert ad-hoc task to calendar event format
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

  // Wrapper functions that maintain the original API for backwards compatibility
  const updateGoogleEvent = useCallback(async (
    eventId: string,
    integrationId: string,
    startTime: Date,
    endTime: Date
  ): Promise<CalendarEvent | null> => {
    const result = await updateGoogleEventInternal(eventId, integrationId, startTime, endTime);
    return result.success ? { id: eventId, startTime, endTime } as CalendarEvent : null;
  }, [updateGoogleEventInternal]);

  const createGoogleEvent = useCallback(async (
    integrationId: string,
    title: string,
    startTime: Date,
    endTime: Date,
    description?: string
  ): Promise<CalendarEvent | null> => {
    const result = await createGoogleEventInternal(integrationId, title, startTime, endTime, description);
    return result.event;
  }, [createGoogleEventInternal]);

  const deleteGoogleEvent = useCallback(async (
    eventId: string,
    integrationId: string
  ): Promise<boolean> => {
    const result = await deleteGoogleEventInternal(eventId, integrationId);
    return result.success;
  }, [deleteGoogleEventInternal]);

  return {
    googleEvents,
    allAsanaTasks,
    filteredAsanaTasks,
    scheduledAsanaTasks,
    isLoading,
    error,
    // Asana filter state
    asanaProjects,
    asanaTypeValues,
    asanaIntegrations,
    asanaFilters,
    setAsanaFilters,
    clearAsanaFilters,
    // Actions
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
    deleteAsanaTask,
  };
}
