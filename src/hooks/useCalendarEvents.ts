'use client';

import { useState, useCallback } from 'react';
import { CalendarEvent, AdHocTask } from '@/types';
import { format } from 'date-fns';

export function useCalendarEvents() {
  const [googleEvents, setGoogleEvents] = useState<CalendarEvent[]>([]);
  const [asanaEvents, setAsanaEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGoogleEvents = useCallback(async (date: Date) => {
    try {
      const response = await fetch(`/api/calendar?date=${date.toISOString()}`);
      if (!response.ok) {
        if (response.status === 401) {
          setGoogleEvents([]);
          return;
        }
        throw new Error('Failed to fetch Google Calendar events');
      }
      const events = await response.json();
      setGoogleEvents(events.map((e: CalendarEvent) => ({
        ...e,
        startTime: new Date(e.startTime),
        endTime: new Date(e.endTime),
      })));
    } catch (err) {
      console.error('Error fetching Google events:', err);
      setGoogleEvents([]);
    }
  }, []);

  const fetchAsanaEvents = useCallback(async (date: Date) => {
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const response = await fetch(`/api/asana-tasks?date=${dateStr}`);
      if (!response.ok) {
        if (response.status === 401) {
          setAsanaEvents([]);
          return;
        }
        throw new Error('Failed to fetch Asana tasks');
      }
      const events = await response.json();
      setAsanaEvents(events.map((e: CalendarEvent) => ({
        ...e,
        startTime: new Date(e.startTime),
        endTime: new Date(e.endTime),
      })));
    } catch (err) {
      console.error('Error fetching Asana events:', err);
      setAsanaEvents([]);
    }
  }, []);

  const fetchAllEvents = useCallback(async (date: Date) => {
    setIsLoading(true);
    setError(null);

    try {
      await Promise.all([
        fetchGoogleEvents(date),
        fetchAsanaEvents(date),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [fetchGoogleEvents, fetchAsanaEvents]);

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

    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // 30 min duration

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

  return {
    googleEvents,
    asanaEvents,
    isLoading,
    error,
    fetchGoogleEvents,
    fetchAsanaEvents,
    fetchAllEvents,
    adhocToCalendarEvent,
  };
}
