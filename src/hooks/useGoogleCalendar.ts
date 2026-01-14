'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { CalendarEvent } from '@/types';
import { api, parseCalendarEvents, ApiRequestError } from '@/lib/api';
import { readGoogleCalendarCache, writeGoogleCalendarCache } from '@/lib/cache';

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
    endTime: Date,
    title?: string,
    description?: string
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
  const isMountedRef = useRef(true);
  const pendingRequestsRef = useRef<Set<string>>(new Set());

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
    const cached = readGoogleCalendarCache();
    if (cached) {
      setGoogleEvents(cached.events);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const eventArrays = await Promise.all(dates.map(fetchGoogleEventsForDate));
      if (!isMountedRef.current) return;

      const allEvents = eventArrays.flat();
      const uniqueEvents = allEvents.filter((event, index, self) =>
        index === self.findIndex(e => e.id === event.id)
      );
      setGoogleEvents(uniqueEvents);
      writeGoogleCalendarCache(uniqueEvents);
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
    endTime: Date,
    title?: string,
    description?: string
  ): Promise<{ success: boolean; error?: string }> => {
    let previousEvent: CalendarEvent | undefined;
    setGoogleEvents(prev => prev.map(event => {
      if (event.id === eventId) {
        previousEvent = event;
        return {
          ...event,
          startTime,
          endTime,
          ...(title !== undefined && { title }),
          ...(description !== undefined && { description }),
        };
      }
      return event;
    }));

    try {
      const updatedEvent = await api.updateCalendarEvent(eventId, integrationId, startTime, endTime, title, description);
      setGoogleEvents(prev => {
        const updated = prev.map(event =>
          event.id === eventId ? { ...updatedEvent, startTime: new Date(updatedEvent.startTime), endTime: new Date(updatedEvent.endTime) } : event
        );
        writeGoogleCalendarCache(updated);
        return updated;
      });

      return { success: true };
    } catch (err) {
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

      setGoogleEvents(prev => {
        const updated = [...prev, parsedEvent];
        writeGoogleCalendarCache(updated);
        return updated;
      });

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
    let previousEvents: CalendarEvent[] = [];
    setGoogleEvents(prev => {
      previousEvents = prev;
      return prev.filter(e => e.id !== eventId);
    });

    try {
      await api.deleteCalendarEvent(eventId, integrationId);
      setGoogleEvents(prev => {
        writeGoogleCalendarCache(prev);
        return prev;
      });
      return { success: true };
    } catch (err) {
      setGoogleEvents(previousEvents);
      const message = err instanceof ApiRequestError ? err.message : 'Failed to delete event';
      return { success: false, error: message };
    }
  }, []);

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
