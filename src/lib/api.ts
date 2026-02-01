// API utilities with retry logic and proper typing

import { AdHocTask, ApiError, AsanaFilterState, AsanaProject, AsanaStory, CalendarEvent, CalendarEventResponse, CalendarEventsResponse, CustomTaskType, ScheduledAsanaTask, SettingsResponse, TaskTemplate } from '@/types';

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

export const api = {
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
    endTime: Date,
    title?: string,
    description?: string
  ): Promise<CalendarEventResponse> {
    return fetchWithRetry<CalendarEventResponse>('/api/calendar', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId,
        integrationId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        title,
        description,
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

  async getTaskStories(
    taskId: string,
    integrationId: string
  ): Promise<{ stories: AsanaStory[] }> {
    return fetchWithRetry<{ stories: AsanaStory[] }>(
      `/api/asana-tasks/${taskId}?integrationId=${encodeURIComponent(integrationId)}`
    );
  },

  async createAsanaTask(
    integrationId: string,
    name: string,
    options?: {
      notes?: string;
      dueOn?: string;
      projectGid?: string;
      customFields?: Record<string, string>; // fieldGid -> enumOptionGid
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

  async updateAsanaTask(
    taskId: string,
    integrationId: string,
    updates: {
      dueOn?: string | null;
      startOn?: string | null;
      customFields?: Record<string, string | null>;
      addProjects?: string[];
      removeProjects?: string[];
    }
  ): Promise<{ success: true; task: CalendarEventResponse }> {
    return fetchWithRetry<{ success: true; task: CalendarEventResponse }>(
      `/api/asana-tasks/${taskId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          ...updates,
        }),
      }
    );
  },

  async getAsanaProjects(): Promise<{ projects: AsanaProject[] }> {
    return fetchWithRetry<{ projects: AsanaProject[] }>('/api/asana-projects');
  },

  async getSettings(): Promise<SettingsResponse> {
    return fetchWithRetry<SettingsResponse>('/api/settings');
  },

  async getTaskTemplates(): Promise<{ templates: TaskTemplate[] }> {
    return fetchWithRetry<{ templates: TaskTemplate[] }>('/api/user-data/task-templates');
  },

  async addTaskTemplate(template: Omit<TaskTemplate, 'id' | 'createdAt'>): Promise<{ template: TaskTemplate }> {
    return fetchWithRetry<{ template: TaskTemplate }>('/api/user-data/task-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(template),
    });
  },

  async updateTaskTemplate(id: string, updates: Partial<TaskTemplate>): Promise<{ template: TaskTemplate }> {
    return fetchWithRetry<{ template: TaskTemplate }>('/api/user-data/task-templates', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    });
  },

  async deleteTaskTemplate(id: string): Promise<{ success: true }> {
    return fetchWithRetry<{ success: true }>('/api/user-data/task-templates', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  },

  async getCustomTaskTypes(): Promise<{ customTypes: CustomTaskType[] }> {
    return fetchWithRetry<{ customTypes: CustomTaskType[] }>('/api/user-data/custom-task-types');
  },

  async addCustomTaskType(customType: Omit<CustomTaskType, 'id' | 'createdAt'>): Promise<{ customType: CustomTaskType }> {
    return fetchWithRetry<{ customType: CustomTaskType }>('/api/user-data/custom-task-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(customType),
    });
  },

  async deleteCustomTaskType(id: string): Promise<{ success: true }> {
    return fetchWithRetry<{ success: true }>('/api/user-data/custom-task-types', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  },

  async getAdHocTasks(): Promise<{ tasks: AdHocTask[] }> {
    return fetchWithRetry<{ tasks: AdHocTask[] }>('/api/user-data/adhoc-tasks');
  },

  async addAdHocTask(task: Omit<AdHocTask, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ task: AdHocTask }> {
    return fetchWithRetry<{ task: AdHocTask }>('/api/user-data/adhoc-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task),
    });
  },

  async updateAdHocTask(id: string, updates: Partial<AdHocTask>): Promise<{ task: AdHocTask }> {
    return fetchWithRetry<{ task: AdHocTask }>('/api/user-data/adhoc-tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    });
  },

  async deleteAdHocTask(id: string): Promise<{ success: true }> {
    return fetchWithRetry<{ success: true }>('/api/user-data/adhoc-tasks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  },

  async getScheduledAsanaTasks(date?: string): Promise<{ tasks: ScheduledAsanaTask[] }> {
    const url = date
      ? `/api/user-data/scheduled-asana-tasks?date=${encodeURIComponent(date)}`
      : '/api/user-data/scheduled-asana-tasks';
    return fetchWithRetry<{ tasks: ScheduledAsanaTask[] }>(url);
  },

  async getScheduleByGoogleEventId(googleEventId: string): Promise<{ schedule: ScheduledAsanaTask | null }> {
    return fetchWithRetry<{ schedule: ScheduledAsanaTask | null }>(
      `/api/user-data/scheduled-asana-tasks?googleEventId=${encodeURIComponent(googleEventId)}`
    );
  },

  async scheduleAsanaTask(
    asanaTaskId: string,
    integrationId: string | undefined,
    scheduledDate: string,
    scheduledTime: string,
    duration: number,
    googleEventId?: string,
    googleIntegrationId?: string
  ): Promise<{ scheduled: ScheduledAsanaTask }> {
    return fetchWithRetry<{ scheduled: ScheduledAsanaTask }>('/api/user-data/scheduled-asana-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asanaTaskId,
        integrationId,
        scheduledDate,
        scheduledTime,
        duration,
        googleEventId,
        googleIntegrationId,
      }),
    });
  },

  async updateScheduledAsanaTask(id: string, updates: Partial<ScheduledAsanaTask>): Promise<{ schedule: ScheduledAsanaTask }> {
    return fetchWithRetry<{ schedule: ScheduledAsanaTask }>('/api/user-data/scheduled-asana-tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    });
  },

  async updateScheduledAsanaTaskByGoogleEvent(googleEventId: string, updates: Partial<ScheduledAsanaTask>): Promise<{ schedule: ScheduledAsanaTask }> {
    return fetchWithRetry<{ schedule: ScheduledAsanaTask }>('/api/user-data/scheduled-asana-tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ googleEventId, ...updates }),
    });
  },

  async unscheduleAsanaTask(id: string): Promise<{ success: true }> {
    return fetchWithRetry<{ success: true }>('/api/user-data/scheduled-asana-tasks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  },

  async unscheduleAllAsanaTaskInstances(asanaTaskId: string): Promise<{ success: true; removedCount: number }> {
    return fetchWithRetry<{ success: true; removedCount: number }>('/api/user-data/scheduled-asana-tasks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asanaTaskId, all: true }),
    });
  },

  async getAsanaFilterPreferences(integrationId?: string): Promise<{ filters: AsanaFilterState }> {
    const url = integrationId
      ? `/api/user-data/asana-filters?integrationId=${encodeURIComponent(integrationId)}`
      : '/api/user-data/asana-filters?integrationId=default';
    return fetchWithRetry<{ filters: AsanaFilterState }>(url);
  },

  async getAllAsanaFilterPreferences(): Promise<{ filtersMap: Record<string, AsanaFilterState> }> {
    return fetchWithRetry<{ filtersMap: Record<string, AsanaFilterState> }>('/api/user-data/asana-filters');
  },

  async saveAsanaFilterPreferences(filters: AsanaFilterState, integrationId?: string): Promise<{ success: true; filters: AsanaFilterState; integrationId?: string }> {
    return fetchWithRetry<{ success: true; filters: AsanaFilterState; integrationId?: string }>('/api/user-data/asana-filters', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filters, integrationId }),
    });
  },
};

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
