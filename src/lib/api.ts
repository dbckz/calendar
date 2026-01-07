// API utilities with retry logic and proper typing

import { ApiError, AsanaProject, CalendarEvent, CalendarEventResponse, CalendarEventsResponse, SettingsResponse } from '@/types';

interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  retryDelay: 1000,
  shouldRetry: (error, attempt) => {
    // Retry on network errors or 5xx server errors
    if (error instanceof TypeError) return true; // Network error
    if (error instanceof ApiRequestError) {
      return error.status >= 500 && attempt < 3;
    }
    return false;
  },
};

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: ApiError
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry<T>(
  url: string,
  options?: RequestInit,
  retryOptions?: RetryOptions
): Promise<T> {
  const { maxRetries, retryDelay, shouldRetry } = {
    ...DEFAULT_RETRY_OPTIONS,
    ...retryOptions,
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new ApiRequestError(
          data.error || `Request failed with status ${response.status}`,
          response.status,
          data
        );
      }

      return await response.json();
    } catch (error) {
      lastError = error;

      // Don't retry on auth errors (401, 403)
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
        throw error;
      }

      if (attempt < maxRetries && shouldRetry(error, attempt)) {
        await delay(retryDelay * (attempt + 1)); // Exponential backoff
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

// Type-safe API methods

export const api = {
  // Calendar events
  async getCalendarEvents(date: Date): Promise<CalendarEventsResponse> {
    return fetchWithRetry<CalendarEventsResponse>(
      `/api/calendar?date=${date.toISOString()}`
    );
  },

  async createCalendarEvent(
    integrationId: string,
    title: string,
    startTime: Date,
    endTime: Date,
    description?: string
  ): Promise<CalendarEventResponse> {
    return fetchWithRetry<CalendarEventResponse>('/api/calendar', {
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
  },

  async updateCalendarEvent(
    eventId: string,
    integrationId: string,
    startTime: Date,
    endTime: Date
  ): Promise<CalendarEventResponse> {
    return fetchWithRetry<CalendarEventResponse>('/api/calendar', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId,
        integrationId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      }),
    });
  },

  async deleteCalendarEvent(
    eventId: string,
    integrationId: string
  ): Promise<{ success: true }> {
    return fetchWithRetry<{ success: true }>('/api/calendar', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, integrationId }),
    });
  },

  // Asana tasks
  async getAllAsanaTasks(): Promise<CalendarEventsResponse> {
    return fetchWithRetry<CalendarEventsResponse>('/api/asana-tasks/all');
  },

  async completeAsanaTask(
    taskId: string,
    integrationId: string,
    completed: boolean
  ): Promise<{ success: true; completed: boolean }> {
    return fetchWithRetry<{ success: true; completed: boolean }>(
      `/api/asana-tasks/${taskId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed, integrationId }),
      }
    );
  },

  async addAsanaComment(
    taskId: string,
    integrationId: string,
    comment: string
  ): Promise<{ success: true }> {
    return fetchWithRetry<{ success: true }>(
      `/api/asana-tasks/${taskId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment, integrationId }),
      }
    );
  },

  async deleteAsanaTask(
    taskId: string,
    integrationId: string
  ): Promise<{ success: true }> {
    return fetchWithRetry<{ success: true }>(
      `/api/asana-tasks/${taskId}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrationId }),
      }
    );
  },

  async createAsanaTask(
    integrationId: string,
    name: string,
    options?: {
      notes?: string;
      dueOn?: string;
      projectGid?: string;
    }
  ): Promise<{ success: true; task: CalendarEventResponse }> {
    return fetchWithRetry<{ success: true; task: CalendarEventResponse }>(
      '/api/asana-tasks',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          name,
          ...options,
        }),
      }
    );
  },

  async getAsanaProjects(): Promise<{ projects: AsanaProject[] }> {
    return fetchWithRetry<{ projects: AsanaProject[] }>('/api/asana-projects');
  },

  // Settings
  async getSettings(): Promise<SettingsResponse> {
    return fetchWithRetry<SettingsResponse>('/api/settings');
  },
};

// Helper to parse API calendar events with Date objects
export function parseCalendarEvent(event: CalendarEventResponse): CalendarEvent {
  return {
    ...event,
    startTime: new Date(event.startTime),
    endTime: new Date(event.endTime),
  };
}

export function parseCalendarEvents(events: CalendarEventsResponse): CalendarEvent[] {
  return events.map(parseCalendarEvent);
}
