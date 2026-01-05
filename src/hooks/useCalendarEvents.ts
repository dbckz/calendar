'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { CalendarEvent, AdHocTask, ScheduledAsanaTask } from '@/types';
import { format, subDays, addDays } from 'date-fns';
import {
  getScheduledAsanaTasks,
  scheduleAsanaTask,
  updateScheduledAsanaTask,
  unscheduleAsanaTask,
} from '@/lib/storage';

export function useCalendarEvents() {
  const [googleEvents, setGoogleEvents] = useState<CalendarEvent[]>([]);
  const [allAsanaTasks, setAllAsanaTasks] = useState<CalendarEvent[]>([]);
  const [scheduledAsanaTasks, setScheduledAsanaTasks] = useState<ScheduledAsanaTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  // Load scheduled Asana tasks from localStorage
  useEffect(() => {
    setScheduledAsanaTasks(getScheduledAsanaTasks());
  }, []);

  // Fetch Google events for a specific date
  const fetchGoogleEventsForDate = async (date: Date): Promise<CalendarEvent[]> => {
    try {
      const response = await fetch(`/api/calendar?date=${date.toISOString()}`);
      if (!response.ok) {
        if (response.status === 401) {
          return [];
        }
        throw new Error('Failed to fetch Google Calendar events');
      }
      const events = await response.json();
      return events.map((e: CalendarEvent) => ({
        ...e,
        startTime: new Date(e.startTime),
        endTime: new Date(e.endTime),
      }));
    } catch (err) {
      console.error('Error fetching Google events:', err);
      return [];
    }
  };

  const fetchAllAsanaTasks = useCallback(async () => {
    try {
      const response = await fetch('/api/asana-tasks/all');
      if (!response.ok) {
        if (response.status === 401) {
          setAllAsanaTasks([]);
          return;
        }
        throw new Error('Failed to fetch all Asana tasks');
      }
      const tasks = await response.json();
      setAllAsanaTasks(tasks.map((t: CalendarEvent) => ({
        ...t,
        startTime: new Date(t.startTime),
        endTime: new Date(t.endTime),
      })));
    } catch (err) {
      console.error('Error fetching all Asana tasks:', err);
      setAllAsanaTasks([]);
    }
  }, []);

  // Fetch all events for yesterday, today, and tomorrow
  const fetchAllEvents = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const today = new Date();
      const yesterday = subDays(today, 1);
      const tomorrow = addDays(today, 1);

      // Fetch Google events for all three days in parallel
      const [yesterdayEvents, todayEvents, tomorrowEvents] = await Promise.all([
        fetchGoogleEventsForDate(yesterday),
        fetchGoogleEventsForDate(today),
        fetchGoogleEventsForDate(tomorrow),
      ]);

      // Combine and deduplicate events by ID
      const allEvents = [...yesterdayEvents, ...todayEvents, ...tomorrowEvents];
      const uniqueEvents = allEvents.filter((event, index, self) =>
        index === self.findIndex(e => e.id === event.id)
      );

      setGoogleEvents(uniqueEvents);

      // Fetch all Asana tasks
      await fetchAllAsanaTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [fetchAllAsanaTasks]);

  // Fetch on mount
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

    // Use task duration or default to 60 minutes
    const duration = task.duration || 60;
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

  // Schedule an Asana task on the calendar
  const scheduleAsana = useCallback((
    asanaTaskId: string,
    integrationId: string | undefined,
    scheduledDate: string,
    scheduledTime: string,
    duration: number
  ) => {
    const scheduled = scheduleAsanaTask(asanaTaskId, integrationId, scheduledDate, scheduledTime, duration);
    setScheduledAsanaTasks(getScheduledAsanaTasks());
    return scheduled;
  }, []);

  // Update a scheduled Asana task
  const updateScheduledAsana = useCallback((
    asanaTaskId: string,
    updates: Partial<ScheduledAsanaTask>
  ) => {
    const updated = updateScheduledAsanaTask(asanaTaskId, updates);
    setScheduledAsanaTasks(getScheduledAsanaTasks());
    return updated;
  }, []);

  // Unschedule an Asana task
  const unscheduleAsana = useCallback((asanaTaskId: string) => {
    const result = unscheduleAsanaTask(asanaTaskId);
    setScheduledAsanaTasks(getScheduledAsanaTasks());
    return result;
  }, []);

  // Update a Google Calendar event (optimistic update)
  const updateGoogleEvent = useCallback(async (
    eventId: string,
    integrationId: string,
    startTime: Date,
    endTime: Date
  ): Promise<CalendarEvent | null> => {
    // Optimistically update local state immediately
    let previousEvent: CalendarEvent | undefined;
    setGoogleEvents(prev => prev.map(event => {
      if (event.id === eventId) {
        previousEvent = event;
        return { ...event, startTime, endTime };
      }
      return event;
    }));

    try {
      const response = await fetch('/api/calendar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          integrationId,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update Google Calendar event');
      }

      const updatedEvent = await response.json();
      const parsedEvent: CalendarEvent = {
        ...updatedEvent,
        startTime: new Date(updatedEvent.startTime),
        endTime: new Date(updatedEvent.endTime),
      };

      // Update with server response (in case there are any differences)
      setGoogleEvents(prev => prev.map(event =>
        event.id === eventId ? parsedEvent : event
      ));

      return parsedEvent;
    } catch (err) {
      console.error('Error updating Google event:', err);
      // Rollback on error
      if (previousEvent) {
        setGoogleEvents(prev => prev.map(event =>
          event.id === eventId ? previousEvent! : event
        ));
      }
      return null;
    }
  }, []);

  // Get scheduled calendar events for Asana tasks on a specific date
  const getScheduledAsanaEventsForDate = useCallback((date: string): CalendarEvent[] => {
    const scheduled = scheduledAsanaTasks.filter(s => s.scheduledDate === date);

    return scheduled.map(s => {
      const asanaTask = allAsanaTasks.find(t => t.id === s.asanaTaskId);
      if (!asanaTask) return null;

      const [hours, minutes] = s.scheduledTime.split(':').map(Number);
      const startTime = new Date(s.scheduledDate);
      startTime.setHours(hours, minutes, 0, 0);
      const endTime = new Date(startTime.getTime() + s.duration * 60 * 1000);

      return {
        ...asanaTask,
        startTime,
        endTime,
      };
    }).filter((e): e is CalendarEvent => e !== null);
  }, [scheduledAsanaTasks, allAsanaTasks]);

  // Create a Google Calendar event
  const createGoogleEvent = useCallback(async (
    integrationId: string,
    title: string,
    startTime: Date,
    endTime: Date,
    description?: string
  ): Promise<CalendarEvent | null> => {
    try {
      const response = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          title,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          description,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create Google Calendar event');
      }

      const createdEvent = await response.json();
      const parsedEvent: CalendarEvent = {
        ...createdEvent,
        startTime: new Date(createdEvent.startTime),
        endTime: new Date(createdEvent.endTime),
      };

      // Add to local state
      setGoogleEvents(prev => [...prev, parsedEvent]);

      return parsedEvent;
    } catch (err) {
      console.error('Error creating Google event:', err);
      return null;
    }
  }, []);

  // Delete a Google Calendar event
  const deleteGoogleEvent = useCallback(async (
    eventId: string,
    integrationId: string
  ): Promise<boolean> => {
    // Optimistically remove from local state
    const previousEvents = googleEvents;
    setGoogleEvents(prev => prev.filter(e => e.id !== eventId));

    try {
      const response = await fetch('/api/calendar', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          integrationId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete Google Calendar event');
      }

      return true;
    } catch (err) {
      console.error('Error deleting Google event:', err);
      // Rollback on error
      setGoogleEvents(previousEvents);
      return false;
    }
  }, [googleEvents]);

  return {
    googleEvents,
    allAsanaTasks,
    scheduledAsanaTasks,
    isLoading,
    error,
    fetchAllEvents,
    adhocToCalendarEvent,
    scheduleAsana,
    updateScheduledAsana,
    unscheduleAsana,
    updateGoogleEvent,
    createGoogleEvent,
    deleteGoogleEvent,
    getScheduledAsanaEventsForDate,
  };
}
