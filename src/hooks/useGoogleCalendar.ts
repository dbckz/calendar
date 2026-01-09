'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { CalendarEvent } from '@/types';
import { api, parseCalendarEvents, ApiRequestError } from '@/lib/api';

interface UseGoogleCalendarReturn {
  googleEvents: CalendarEvent[];
  isLoading: boolean;
  error: string | null;
  fetchGoogleEventsForDate: (date: Date) => Promise<CalendarEvent[]>;
  fetchGoogleEventsForDates: (dates: Date[]) => Promise<void>;
  updateGoogleEvent: (
    eventId: string,
    integrationId: string,
    startTime: Date,
    endTime: Date
  ) => Promise<{ success: boolean; error?: string }>;
  createGoogleEvent: (
    integrationId: string,
    title: string,
    startTime: Date,
    endTime: Date,
    description?: string
  ) => Promise<{ event: CalendarEvent | null; error?: string }>;
  deleteGoogleEvent: (
    eventId: string,
    integrationId: string
  ) => Promise<{ success: boolean; error?: string }>;
  setGoogleEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
}

export function useGoogleCalendar(): UseGoogleCalendarReturn {
  const [googleEvents, setGoogleEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ref for tracking mounted state to prevent memory leaks
  const isMountedRef = useRef(true);

  // Ref for tracking pending requests to prevent duplicates
  const pendingRequestsRef = useRef<Set<string>>(new Set());

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchGoogleEventsForDate = useCallback(async (date: Date): Promise<CalendarEvent[]> => {
    const dateKey = date.toISOString().split('T')[0];

    // Skip if already fetching this date
    if (pendingRequestsRef.current.has(dateKey)) {
      return [];
    }

    pendingRequestsRef.current.add(dateKey);

    try {
      const events = await api.getCalendarEvents(date);
      return parseCalendarEvents(events);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        return []; // Not authenticated, return empty
      }
      console.error('Error fetching Google events:', err);
      return [];
    } finally {
      pendingRequestsRef.current.delete(dateKey);
    }
  }, []);

  const fetchGoogleEventsForDates = useCallback(async (dates: Date[]) => {
    setIsLoading(true);
    setError(null);

    try {
      const eventArrays = await Promise.all(dates.map(fetchGoogleEventsForDate));
      if (!isMountedRef.current) return;

      const allEvents = eventArrays.flat();

      // Deduplicate by ID
      const uniqueEvents = allEvents.filter((event, index, self) =>
        index === self.findIndex(e => e.id === event.id)
      );

      setGoogleEvents(uniqueEvents);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to fetch calendar events');
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [fetchGoogleEventsForDate]);

  const updateGoogleEvent = useCallback(async (
    eventId: string,
    integrationId: string,
    startTime: Date,
    endTime: Date
  ): Promise<{ success: boolean; error?: string }> => {
    // Optimistically update local state
    let previousEvent: CalendarEvent | undefined;
    setGoogleEvents(prev => prev.map(event => {
      if (event.id === eventId) {
        previousEvent = event;
        return { ...event, startTime, endTime };
      }
      return event;
    }));

    try {
      const updatedEvent = await api.updateCalendarEvent(eventId, integrationId, startTime, endTime);

      // Update with server response
      setGoogleEvents(prev => prev.map(event =>
        event.id === eventId ? { ...updatedEvent, startTime: new Date(updatedEvent.startTime), endTime: new Date(updatedEvent.endTime) } : event
      ));

      return { success: true };
    } catch (err) {
      // Rollback on error
      if (previousEvent) {
        setGoogleEvents(prev => prev.map(event =>
          event.id === eventId ? previousEvent! : event
        ));
      }

      const message = err instanceof ApiRequestError ? err.message : 'Failed to update event';
      return { success: false, error: message };
    }
  }, []);

  const createGoogleEvent = useCallback(async (
    integrationId: string,
    title: string,
    startTime: Date,
    endTime: Date,
    description?: string
  ): Promise<{ event: CalendarEvent | null; error?: string }> => {
    try {
      const createdEvent = await api.createCalendarEvent(integrationId, title, startTime, endTime, description);

      const parsedEvent: CalendarEvent = {
        ...createdEvent,
        startTime: new Date(createdEvent.startTime),
        endTime: new Date(createdEvent.endTime),
      };

      setGoogleEvents(prev => [...prev, parsedEvent]);
      return { event: parsedEvent };
    } catch (err) {
      const message = err instanceof ApiRequestError ? err.message : 'Failed to create event';
      return { event: null, error: message };
    }
  }, []);

  const deleteGoogleEvent = useCallback(async (
    eventId: string,
    integrationId: string
  ): Promise<{ success: boolean; error?: string }> => {
    // Optimistically remove
    const previousEvents = googleEvents;
    setGoogleEvents(prev => prev.filter(e => e.id !== eventId));

    try {
      await api.deleteCalendarEvent(eventId, integrationId);
      return { success: true };
    } catch (err) {
      // Rollback
      setGoogleEvents(previousEvents);
      const message = err instanceof ApiRequestError ? err.message : 'Failed to delete event';
      return { success: false, error: message };
    }
  }, [googleEvents]);

  return {
    googleEvents,
    isLoading,
    error,
    fetchGoogleEventsForDate,
    fetchGoogleEventsForDates,
    updateGoogleEvent,
    createGoogleEvent,
    deleteGoogleEvent,
    setGoogleEvents,
  };
}
