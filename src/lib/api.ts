// API utilities with retry logic and proper typing

import { AdHocTask, ApiError, AsanaFilterState, AsanaProject, AsanaStory, AsanaTag, CalendarEvent, CalendarEventResponse, CalendarEventsResponse, CustomTaskType, DelegationQueueEntry, GoogleSubCalendar, OrchestratorStatus, Reminder, ScheduledAsanaTask, SettingsResponse, TaskMetadata, TaskTemplate } from '@/types';
import type { CapacityRow } from '@/lib/capacity';
import type { ProposedBlock } from '@/lib/scheduling/types';
import type { ReplanKept, ReplanMove, ReplanUnplaceable, ReplanStale, ReplanDeletion, ReplanReviewBlock } from '@/lib/scheduling/replan';
import type { WorkflowConfig } from '@/lib/workflow-config-storage';

export interface QuotaSummaryRow {
  category: string;
  weeklyCount: number;
  existing: number;
  proposed: number;
  unmet: number;
}

// Usable free work time left in the remaining week after a plan is proposed.
export interface SpareCapacityRow {
  date: string; // yyyy-MM-dd
  freeMinutes: number;
}

export interface SpareCapacity {
  totalMinutes: number;
  gapCount: number;
  largestGapMinutes: number;
  byDate: SpareCapacityRow[];
}

export interface ProposeWeekResponse {
  weekStart: string;
  weekEnd: string;
  proposals: ProposedBlock[];
  quotaSummary: QuotaSummaryRow[];
  // Absent on older responses; the review step shows a spare-capacity line and
  // an "Add more tasks" affordance when present.
  spareCapacity?: SpareCapacity;
  // Working days (yyyy-MM-dd) with no exercise placement in the final proposals
  // or an existing calendar exercise event. The review step warns per day.
  exerciseMissingDays?: string[];
}

export interface ConfirmWeekResult {
  id: string;
  success: boolean;
  googleEventId?: string;
  error?: string;
}

// --- "Plan my week" wizard: priorities, prep and task-candidate shapes ---

export interface ProposeWeekRequest {
  weekStart?: string;
  selections?: Record<string, string[]>; // category -> selected candidate ids
  priorityGids?: string[];
  // Task ids (gid or adhocId) flagged "must do this week". Marked isPriority on
  // the engine's candidates so they sort first within their category and are
  // never dropped by a selection cap.
  mustDoIds?: string[];
  categoryOverrides?: Record<string, string>; // candidate id -> category
  prepBlocks?: ProposedBlock[];
  durationOverrides?: Record<string, number>; // grouped category -> per-week block length (mins)
  taskDurationOverrides?: Record<string, number>; // task id (gid/adhocId) -> block length (mins)
}

export interface PriorityMatchRow {
  text: string;
  match: { gid: string; title: string; integrationId: string; category: string | null } | null;
}

export interface MatchPrioritiesResponse {
  results: PriorityMatchRow[];
  asanaIntegrations: Array<{ id: string; name: string }>;
  categories: string[];
  aiUnavailable?: boolean;
}

export interface CreatePriorityTasksResponse {
  created: Array<{ text: string; gid: string; title: string; integrationId: string }>;
  errors: Array<{ text: string; error: string }>;
}

export interface PrepMeetingRow {
  key: string;
  eventId: string;
  title: string;
  date: string;
  start: string;
  needsPrep: boolean;
  decidedBy: 'user' | 'ai';
  reason: string;
  block?: ProposedBlock;
}

export interface PrepCandidatesResponse {
  meetings: PrepMeetingRow[];
  unplaced: Array<{ key: string; title: string }>;
  // Working days (yyyy-MM-dd) of the remaining week, for the per-meeting prep-day
  // dropdown. Absent on older responses.
  workingDays?: string[];
}

export interface WeekCandidate {
  id: string;
  gid?: string;
  // Asana integration id (present for Asana-backed tasks). Needed to mark the
  // task done in Asana from the wizard.
  integrationId?: string;
  // Display name of the Asana integration/workspace this task comes from (e.g.
  // "DBC" / "OM"). Present for Asana-backed tasks; absent for ad-hoc tasks.
  integrationName?: string;
  title: string;
  dueDate?: string;
  deadlineType?: string;
  isPriority: boolean;
}

export interface WeekCandidateCategory {
  category: string;
  // No-quota catch-all categories (e.g. "General Todos") have no weekly cap:
  // noQuota is true and remainingQuota is null — pick any number of candidates.
  noQuota: boolean;
  // Grouped categories (e.g. Engagement / Outreach) also lift the selection cap
  // (remainingQuota is null); their picked tasks are spread across fixed blocks.
  grouped?: boolean;
  // True when the category has an explicit maxSelection cap. Unlike a plain
  // grouped/no-quota category, this cap is enforced even in "Add more tasks"
  // mode (the cap is never lifted), and remainingQuota carries the cap value.
  hasMaxSelection?: boolean;
  remainingQuota: number | null;
  // Count of this category's tasks currently deferred to a later week (shown as
  // a muted "N deferred to next week" note on the wizard's tasks step).
  deferredCount?: number;
  autoSelect: boolean;
  // Category's configured target block length in minutes (parsed from the
  // workflow config's targetLength). Used as the default for the per-week
  // block-length override on the tasks step.
  targetLengthMinutes: number;
  candidates: WeekCandidate[];
}

export interface WeekCandidatesResponse {
  categories: WeekCandidateCategory[];
}

export interface ConfirmWeekResponse {
  results: ConfirmWeekResult[];
}

// --- Mid-week replan ---

export interface ReplanAnalyzeResponse {
  weekStart: string;
  weekEnd: string;
  kept: ReplanKept[];
  moves: ReplanMove[];
  unplaceable: ReplanUnplaceable[];
  stale: ReplanStale[];
  // Missing rituals to add on remaining working days (exercise is priority one).
  additions: ProposedBlock[];
  // Conflicted break blocks to delete (a break has no fixed home to move to).
  deletions: ReplanDeletion[];
  // Past app blocks (task/prep) for the daily-review step. Absent on older
  // responses — treat as [].
  reviewBlocks?: ReplanReviewBlock[];
}

export interface ReplanConfirmResult {
  googleEventId: string;
  success: boolean;
  error?: string;
}

// One Asana-completion result from the daily-review apply (keyed by task gid).
export interface ReplanAsanaResult {
  gid: string;
  success: boolean;
  error?: string;
}

// One defer / leave-unscheduled result for an unplaceable block.
export interface ReplanDeferResult {
  taskIds: string[];
  googleEventId?: string;
  success: boolean;
  error?: string;
}

// A created ritual addition, reported back by its proposal id.
export interface ReplanAdditionResult {
  id: string;
  success: boolean;
  googleEventId?: string;
  error?: string;
}

export interface ResetWeekResponse {
  eventsDeleted: number;
  recordsCleared: number;
}

export interface ClientTimeRow {
  integrationId: string;
  integrationName: string;
  totalMinutes: number;
}

export interface DashboardCapacityResponse {
  weekStart: string;
  weekEnd: string;
  capacity: CapacityRow[];
  clientTime: ClientTimeRow[];
}

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
    description?: string,
    eventType?: 'default' | 'focusTime',
    calendarId?: string,
    options?: {
      allDay?: boolean;
      recurrence?: string[];
      transparency?: 'opaque' | 'transparent';
    }
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
        eventType,
        calendarId,
        allDay: options?.allDay,
        recurrence: options?.recurrence,
        transparency: options?.transparency,
      }),
    });
  },

  async updateCalendarEvent(
    eventId: string,
    integrationId: string,
    startTime: Date,
    endTime: Date,
    title?: string,
    description?: string,
    calendarId?: string,
    colorId?: string
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
        calendarId,
        colorId,
      }),
    });
  },

  async deleteCalendarEvent(
    eventId: string,
    integrationId: string,
    calendarId?: string
  ): Promise<{ success: true }> {
    return fetchWithRetry<{ success: true }>('/api/calendar', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, integrationId, calendarId }),
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
    comment: string,
    htmlText?: string
  ): Promise<{ success: true }> {
    return fetchWithRetry<{ success: true }>(
      `/api/asana-tasks/${taskId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment, htmlText, integrationId }),
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
      addTags?: string[];
      removeTags?: string[];
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

  async getAsanaTags(integrationId: string): Promise<AsanaTag[]> {
    return fetchWithRetry<AsanaTag[]>(
      `/api/asana-tags?integrationId=${encodeURIComponent(integrationId)}`
    );
  },

  async createAsanaTag(integrationId: string, name: string, color?: string): Promise<AsanaTag> {
    return fetchWithRetry<AsanaTag>('/api/asana-tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrationId, name, color }),
    });
  },

  async getOrchestratorStatus(): Promise<OrchestratorStatus> {
    return fetchWithRetry<OrchestratorStatus>('/api/orchestrator/status');
  },

  // Delegation queue (app-owned, keyed by Asana task GID)
  async getDelegationQueue(): Promise<{ entries: Record<string, DelegationQueueEntry> }> {
    return fetchWithRetry<{ entries: Record<string, DelegationQueueEntry> }>('/api/orchestrator/queue');
  },

  async upsertDelegationEntry(
    asanaTaskGid: string,
    integrationId: string,
    updates: Partial<Omit<DelegationQueueEntry, 'asanaTaskGid' | 'integrationId' | 'updatedAt'>>
  ): Promise<{ entry: DelegationQueueEntry }> {
    return fetchWithRetry<{ entry: DelegationQueueEntry }>('/api/orchestrator/queue', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asanaTaskGid, integrationId, ...updates }),
    });
  },

  async deleteDelegationEntry(asanaTaskGid: string): Promise<{ success: boolean }> {
    return fetchWithRetry<{ success: boolean }>(
      `/api/orchestrator/queue?asanaTaskGid=${encodeURIComponent(asanaTaskGid)}`,
      { method: 'DELETE' }
    );
  },

  async runNowDelegation(
    asanaTaskGid: string,
    integrationId: string,
    brief: string,
    title: string
  ): Promise<{ started: boolean }> {
    return fetchWithRetry<{ started: boolean }>('/api/orchestrator/run-now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asanaTaskGid, integrationId, brief, title }),
    });
  },

  async getDelegationTrace(file: string): Promise<{ events: unknown[] }> {
    return fetchWithRetry<{ events: unknown[] }>(
      `/api/orchestrator/trace?file=${encodeURIComponent(file)}`
    );
  },

  // Re-assess which tasks are AI-runnable. Cached tasks are skipped server-side;
  // only changed/new ones hit the model. No retry — the call is expensive.
  async classifyAiTasks(
    tasks: Array<{ gid: string; integrationId: string; title: string; description?: string; integrationName?: string }>
  ): Promise<{ total: number; assessed: number; cached: number; changed: number; promptVersion: string }> {
    return fetchWithRetry(
      '/api/tasks/classify-ai',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks }),
      },
      { maxRetries: 0 }
    );
  },

  // Triage which tasks look stale (deletion candidates). Cached/snoozed tasks are
  // skipped server-side. No retry — the call is expensive.
  async triageStaleTasks(
    tasks: Array<{ gid: string; integrationId: string; title: string; description?: string; createdAt?: string; dueOn?: string; startOn?: string; integrationName?: string }>
  ): Promise<{ total: number; assessed: number; staleTasks: Array<{ gid: string; reason: string }> }> {
    return fetchWithRetry(
      '/api/tasks/triage-stale',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks }),
      },
      { maxRetries: 0 }
    );
  },

  // Suggest a "Type" label for each untyped task, grouped by integration (allowed
  // labels differ per workspace). Returns one suggestion per task, each an exact
  // allowed label. No retry — the call is expensive.
  async classifyTaskTypes(
    groups: Array<{
      integrationId: string;
      allowedTypes: string[];
      tasks: Array<{ gid: string; title: string; description?: string; integrationName?: string }>;
    }>
  ): Promise<{ suggestions: Array<{ gid: string; type: string }> }> {
    return fetchWithRetry(
      '/api/tasks/classify-types',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups }),
      },
      { maxRetries: 0 }
    );
  },

  // Wizard "Reminders triage" step: suggest a destination Asana workspace/project/
  // type for each reminder, in ONE headless call. Returns ids/gids the dropdowns
  // use (blank where nothing valid fit). No retry — the call is expensive.
  async suggestReminderTriage(
    reminders: Array<{ id: string; title: string; notes?: string }>,
    workspaces: Array<{
      integrationId: string;
      name: string;
      projects: Array<{ gid: string; name: string }>;
      types: string[];
    }>
  ): Promise<{ suggestions: Array<{ id: string; integrationId: string; projectGid: string; taskType: string }> }> {
    return fetchWithRetry(
      '/api/reminders/triage/suggest',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminders, workspaces }),
      },
      { maxRetries: 0 }
    );
  },

  // "Keep active": snooze a task out of the stale list for a period (default 90 days).
  async keepTaskActive(asanaTaskGid: string, days?: number): Promise<{ success: boolean; keptUntil: string }> {
    return fetchWithRetry('/api/tasks/stale-keep', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asanaTaskGid, ...(days ? { days } : {}) }),
    });
  },

  async getSettings(): Promise<SettingsResponse> {
    return fetchWithRetry<SettingsResponse>('/api/settings');
  },

  async getWorkflowConfig(): Promise<WorkflowConfig> {
    const { config } = await fetchWithRetry<{ config: WorkflowConfig }>('/api/workflow-config');
    return config;
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
    googleIntegrationId?: string,
    taskName?: string
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
        taskName,
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

  // Google Event Attributions (for time tracking)
  async getGoogleEventAttributions(): Promise<{ attributions: Array<{ googleEventId: string; googleIntegrationId: string; asanaIntegrationId: string; createdAt: string }> }> {
    return fetchWithRetry('/api/user-data/google-event-attributions');
  },

  async setGoogleEventAttribution(
    googleEventId: string,
    googleIntegrationId: string,
    asanaIntegrationId: string
  ): Promise<{ success: boolean; attribution: { googleEventId: string; googleIntegrationId: string; asanaIntegrationId: string; createdAt: string } }> {
    return fetchWithRetry('/api/user-data/google-event-attributions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ googleEventId, googleIntegrationId, asanaIntegrationId }),
    });
  },

  async removeGoogleEventAttribution(googleEventId: string): Promise<{ success: boolean; removed: boolean }> {
    return fetchWithRetry('/api/user-data/google-event-attributions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ googleEventId }),
    });
  },

  // Reminders
  async getReminders(): Promise<{ reminders: Reminder[] }> {
    return fetchWithRetry<{ reminders: Reminder[] }>('/api/user-data/reminders');
  },

  async addReminder(text: string): Promise<{ reminder: Reminder }> {
    return fetchWithRetry<{ reminder: Reminder }>('/api/user-data/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  },

  async updateReminder(id: string, updates: Partial<Reminder>): Promise<{ reminder: Reminder }> {
    return fetchWithRetry<{ reminder: Reminder }>('/api/user-data/reminders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    });
  },

  async deleteReminder(id: string): Promise<{ success: true }> {
    return fetchWithRetry<{ success: true }>('/api/user-data/reminders', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  },

  async archiveReminders(): Promise<{ success: true; archivedCount: number }> {
    return fetchWithRetry<{ success: true; archivedCount: number }>('/api/user-data/reminders/archive', {
      method: 'POST',
    });
  },

  // Google sub-calendar management
  async getGoogleCalendars(integrationId: string): Promise<{ calendars: GoogleSubCalendar[] }> {
    return fetchWithRetry<{ calendars: GoogleSubCalendar[] }>(
      `/api/google-calendars?integrationId=${encodeURIComponent(integrationId)}`
    );
  },

  async saveGoogleCalendars(integrationId: string, calendars: GoogleSubCalendar[]): Promise<{ success: true; calendars: GoogleSubCalendar[] }> {
    return fetchWithRetry<{ success: true; calendars: GoogleSubCalendar[] }>('/api/google-calendars', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrationId, calendars }),
    });
  },

  // Time tracking API
  async recordTimeTracking(
    date: string,
    integrationTotals: Record<string, { integrationId: string; integrationName: string; totalMinutes: number }>,
    events: Array<{
      eventId: string;
      title: string;
      integrationId: string;
      integrationName: string;
      startTime: string;
      endTime: string;
      durationMinutes: number;
      source: 'google' | 'asana';
      linkedAsanaTaskId?: string;
    }>
  ): Promise<{ success: boolean }> {
    return fetchWithRetry<{ success: boolean }>('/api/time-tracking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, integrationTotals, events }),
    });
  },

  // Task metadata (enrichment layer, keyed by Asana task GID)
  async getTaskMetadata(): Promise<{ metadata: Record<string, TaskMetadata> }> {
    return fetchWithRetry<{ metadata: Record<string, TaskMetadata> }>('/api/user-data/task-metadata');
  },

  async upsertTaskMetadata(
    asanaTaskGid: string,
    integrationId: string,
    updates: Partial<Omit<TaskMetadata, 'asanaTaskGid' | 'integrationId' | 'updatedAt'>>
  ): Promise<{ metadata: TaskMetadata }> {
    return fetchWithRetry<{ metadata: TaskMetadata }>('/api/user-data/task-metadata', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asanaTaskGid, integrationId, ...updates }),
    });
  },

  // Dashboard capacity + client-time for the current ISO week
  async getDashboardCapacity(): Promise<DashboardCapacityResponse> {
    return fetchWithRetry<DashboardCapacityResponse>('/api/dashboard/capacity');
  },

  // "Plan my week" auto-scheduling. Empty body reproduces the original
  // auto-pick-everything behavior; the wizard passes selections/prep/priorities.
  async proposeWeeklyPlan(body?: ProposeWeekRequest): Promise<ProposeWeekResponse> {
    return fetchWithRetry<ProposeWeekResponse>('/api/scheduling/propose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
  },

  // Wizard step 1: match typed priorities against existing Asana tasks.
  async matchPriorities(items: string[], weekStart?: string): Promise<MatchPrioritiesResponse> {
    return fetchWithRetry<MatchPrioritiesResponse>(
      '/api/scheduling/priorities/match',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, ...(weekStart ? { weekStart } : {}) }),
      },
      { maxRetries: 0 }
    );
  },

  // Wizard step 1: create Asana tasks for unmatched priorities.
  async createPriorityTasks(
    items: Array<{ text: string; integrationId: string; projectGid?: string }>
  ): Promise<CreatePriorityTasksResponse> {
    return fetchWithRetry<CreatePriorityTasksResponse>('/api/scheduling/priorities/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
  },

  // Wizard step 3: mark an Asana task complete without leaving the planner.
  async completeAsanaTaskInWizard(gid: string, integrationId: string): Promise<{ success: true }> {
    return fetchWithRetry<{ success: true }>(
      '/api/asana/complete',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gid, integrationId }),
      },
      { maxRetries: 0 }
    );
  },

  // Wizard step 2: which meetings need prep, with proposed slots.
  async getPrepCandidates(
    weekStart?: string,
    prepDurations?: Record<string, number>,
    prepDays?: Record<string, string>
  ): Promise<PrepCandidatesResponse> {
    return fetchWithRetry<PrepCandidatesResponse>(
      '/api/scheduling/prep/candidates',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(weekStart ? { weekStart } : {}),
          ...(prepDurations && Object.keys(prepDurations).length ? { prepDurations } : {}),
          ...(prepDays && Object.keys(prepDays).length ? { prepDays } : {}),
        }),
      },
      { maxRetries: 0 }
    );
  },

  // Wizard step 2: persist a user's prep decision for a meeting title.
  async setPrepDecision(title: string, needsPrep: boolean): Promise<{ ok: true }> {
    return fetchWithRetry<{ ok: true }>('/api/scheduling/prep/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, needsPrep }),
    });
  },

  // Wizard step 3: ranked task candidates per quota category.
  async getWeekCandidates(body?: {
    weekStart?: string;
    priorityGids?: string[];
    categoryOverrides?: Record<string, string>;
  }): Promise<WeekCandidatesResponse> {
    return fetchWithRetry<WeekCandidatesResponse>('/api/scheduling/candidates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
  },

  async confirmWeeklyPlan(
    proposals: ProposedBlock[],
    googleIntegrationId?: string
  ): Promise<ConfirmWeekResponse> {
    return fetchWithRetry<ConfirmWeekResponse>('/api/scheduling/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposals, googleIntegrationId }),
    });
  },

  // Mid-week replan: analyze which of this week's app blocks were missed or now
  // conflict, and propose new slots for them.
  async analyzeReplan(weekStart?: string): Promise<ReplanAnalyzeResponse> {
    return fetchWithRetry<ReplanAnalyzeResponse>(
      '/api/scheduling/replan/analyze',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(weekStart ? { weekStart } : {}),
      },
      { maxRetries: 0 }
    );
  },

  // Mid-week replan: apply the accepted moves (patch each Google event's time +
  // update the stored schedule) and/or mark selected blocks "done".
  async confirmReplan(
    moves: Array<{
      googleEventId: string;
      googleIntegrationId?: string;
      date: string;
      start: string;
      durationMinutes: number;
    }>,
    done?: string[],
    dismiss?: string[],
    additions?: ProposedBlock[],
    deletions?: Array<{ googleEventId: string; googleIntegrationId?: string }>,
    // Daily-review extras: mark blocks not-done (clears done state so they
    // re-classify as missed) and complete selected Asana tasks in Asana.
    notDone?: string[],
    completeAsana?: Array<{ gid: string; integrationId: string }>,
    // Unplaceable-block choices: defer each block's tasks to next week (until is
    // computed server-side), or leave a block unscheduled (clear its override).
    defer?: Array<{ taskIds: string[]; googleEventId?: string }>,
    leaveUnscheduled?: string[]
  ): Promise<{
    results: ReplanConfirmResult[];
    doneResults: ReplanConfirmResult[];
    notDoneResults?: ReplanConfirmResult[];
    asanaResults?: ReplanAsanaResult[];
    deferResults?: ReplanDeferResult[];
    additionResults: ReplanAdditionResult[];
  }> {
    return fetchWithRetry<{
      results: ReplanConfirmResult[];
      doneResults: ReplanConfirmResult[];
      notDoneResults?: ReplanConfirmResult[];
      asanaResults?: ReplanAsanaResult[];
      deferResults?: ReplanDeferResult[];
      additionResults: ReplanAdditionResult[];
    }>(
      '/api/scheduling/replan/confirm',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moves,
          ...(done && done.length ? { done } : {}),
          ...(notDone && notDone.length ? { notDone } : {}),
          ...(completeAsana && completeAsana.length ? { completeAsana } : {}),
          ...(defer && defer.length ? { defer } : {}),
          ...(leaveUnscheduled && leaveUnscheduled.length ? { leaveUnscheduled } : {}),
          ...(dismiss && dismiss.length ? { dismiss } : {}),
          ...(additions && additions.length ? { additions } : {}),
          ...(deletions && deletions.length ? { deletions } : {}),
        }),
      }
    );
  },

  // Daily-review closing message: a short, warm reflection on how the day went.
  // Best-effort — the route always returns a message (model or canned fallback),
  // and the UI shows it without blocking the review apply. No retry.
  async getReviewMessage(outcome: {
    doneCount: number;
    totalCount: number;
    doneTitles: string[];
    notDoneTitles: string[];
  }): Promise<{ message: string }> {
    return fetchWithRetry<{ message: string }>(
      '/api/scheduling/replan/review-message',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(outcome),
      },
      { maxRetries: 0 }
    );
  },

  // "Start the week from scratch": delete this week's upcoming app-created blocks
  // from the calendar and clear the week's planning records.
  async resetWeek(weekStart?: string): Promise<ResetWeekResponse> {
    return fetchWithRetry<ResetWeekResponse>(
      '/api/scheduling/reset-week',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(weekStart ? { weekStart } : {}),
      },
      { maxRetries: 0 }
    );
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
