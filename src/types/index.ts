// Core types for the daily planner app

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  source: 'google' | 'asana' | 'adhoc';
  color?: string;
  location?: string;
  allDay?: boolean;
  completed?: boolean;
  assignee?: string;
  dueOn?: string;
  startOn?: string;
  createdAt?: string;
  integrationId?: string;
  integrationName?: string;
  // Asana-specific fields
  projects?: Array<{ gid: string; name: string }>;
  customFields?: AsanaCustomField[];
  // Link to Asana task (when Google event represents a scheduled Asana task)
  linkedAsanaTaskId?: string;
  linkedAsanaIntegrationId?: string;
}

export interface AsanaCustomField {
  gid: string;
  name: string;
  displayValue: string | null;
  type: string;
}

export interface AsanaTask {
  id: string;
  gid: string;
  name: string;
  notes?: string;
  dueOn?: string;
  dueAt?: string;
  startOn?: string;
  createdAt?: string;
  completed: boolean;
  assignee?: {
    gid: string;
    name: string;
  };
  projects?: Array<{
    gid: string;
    name: string;
  }>;
  customFields?: AsanaCustomField[];
}

export interface AsanaProject {
  gid: string;
  name: string;
  integrationId: string;
  integrationName: string;
}

export interface AsanaStory {
  gid: string;
  type: string;
  text: string;
  createdAt: string;
  createdBy?: {
    gid: string;
    name: string;
  };
  resourceSubtype: string;
}

export type AsanaDateFilter = 'all' | 'overdue' | 'today' | 'this_week' | 'no_date';

export type AsanaSortField = 'dueOn' | 'startOn' | 'createdAt' | 'title' | 'type';
export type AsanaSortDirection = 'asc' | 'desc';

export type AsanaFilterLogic = 'and' | 'or';

export interface AsanaFilterState {
  integrationIds: string[];
  projectIds: string[];
  typeValues: string[]; // Custom field "Type" values
  dueDateRange: AsanaDateFilter;
  startDateRange: AsanaDateFilter;
  filterLogic: AsanaFilterLogic;
  sortField: AsanaSortField;
  sortDirection: AsanaSortDirection;
}

// Legacy alias for backwards compatibility
export type AsanaDueDateFilter = AsanaDateFilter;

// Built-in task types
export type BuiltInTaskType =
  | 'flight'
  | 'train'
  | 'car'
  | 'walk'
  | 'writing'
  | 'reading'
  | 'focus'
  | 'email'
  | 'batch';

// Custom task type created by user
export interface CustomTaskType {
  id: string;
  label: string;
  emoji: string;
  createdAt: string;
}

// TaskType can be either a built-in type or a custom type ID (prefixed with 'custom:')
export type TaskType = BuiltInTaskType | `custom:${string}`;

// Helper type for form state where task type might not be selected yet
export type TaskTypeSelection = TaskType | null;

export const BUILT_IN_TASK_TYPE_EMOJIS: Record<BuiltInTaskType, string> = {
  flight: '✈️',
  train: '🚂',
  car: '🚗',
  walk: '🚶',
  writing: '✍️',
  reading: '📖',
  focus: '🎯',
  email: '📧',
  batch: '📦',
};

export const BUILT_IN_TASK_TYPE_LABELS: Record<BuiltInTaskType, string> = {
  flight: 'Flight',
  train: 'Train',
  car: 'Car',
  walk: 'Walk',
  writing: 'Writing',
  reading: 'Reading',
  focus: 'Focus time',
  email: 'Email',
  batch: 'Batch',
};

// Helper functions to work with task types
export function isCustomTaskType(taskType: TaskType): taskType is `custom:${string}` {
  return taskType.startsWith('custom:');
}

export function getCustomTaskTypeId(taskType: `custom:${string}`): string {
  return taskType.slice(7); // Remove 'custom:' prefix
}

// Legacy compatibility - these will be populated dynamically
export const TASK_TYPE_EMOJIS: Record<string, string> = { ...BUILT_IN_TASK_TYPE_EMOJIS };
export const TASK_TYPE_LABELS: Record<string, string> = { ...BUILT_IN_TASK_TYPE_LABELS };

export interface AdHocTask {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  dueTime?: string;
  duration?: number; // in minutes
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  taskType: TaskType;
  googleEventId?: string; // ID of the corresponding Google Calendar event
  googleIntegrationId?: string; // Which Google integration it was created in
  createdAt: string;
  updatedAt: string;
}

// Local schedule for Asana tasks (stored in localStorage)
// Each entry represents one scheduled time block - same task can have multiple entries
export interface ScheduledAsanaTask {
  id: string; // Unique ID for this schedule entry
  asanaTaskId: string;
  integrationId?: string;
  scheduledDate: string; // yyyy-MM-dd
  scheduledTime: string; // HH:mm
  duration: number; // in minutes
  // Link to Google Calendar event (for unified display)
  googleEventId?: string;
  googleIntegrationId?: string;
}

export interface GoogleCalendarCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface AsanaCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

// Legacy single-integration settings (v1)
export interface LegacyAppSettings {
  version?: 1;
  googleCalendar: {
    enabled: boolean;
    clientId: string;
    clientSecret: string;
    credentials?: GoogleCalendarCredentials;
  };
  asana: {
    enabled: boolean;
    clientId: string;
    clientSecret: string;
    credentials?: AsanaCredentials;
    workspaceId?: string;
  };
}

// Multi-integration types (v2)
export interface IntegrationBase {
  id: string;
  name: string;
  enabled: boolean;
  createdAt: string;
}

export interface GoogleIntegration extends IntegrationBase {
  type: 'google';
  clientId: string;
  clientSecret: string;
  credentials?: GoogleCalendarCredentials;
}

export interface AsanaIntegration extends IntegrationBase {
  type: 'asana';
  clientId: string;
  clientSecret: string;
  credentials?: AsanaCredentials;
  workspaceId?: string;
}

export type Integration = GoogleIntegration | AsanaIntegration;

export interface MultiIntegrationSettings {
  version: 2;
  googleIntegrations: GoogleIntegration[];
  asanaIntegrations: AsanaIntegration[];
}

// Union type - can be either legacy or new format
export type AppSettings = LegacyAppSettings | MultiIntegrationSettings;

// Type guard helpers
export function isMultiIntegrationSettings(settings: AppSettings): settings is MultiIntegrationSettings {
  return 'version' in settings && settings.version === 2;
}

export function isLegacySettings(settings: AppSettings): settings is LegacyAppSettings {
  return !('version' in settings) || settings.version === 1;
}

export interface TimeSlot {
  time: string;
  hour: number;
  events: CalendarEvent[];
}

export type ViewMode = 'timeline' | 'list';

// Drag and drop types
export interface DragItem {
  type: 'asana-task' | 'adhoc-task' | 'calendar-event' | 'task-template';
  id: string;
  source: 'asana' | 'adhoc' | 'google' | 'template';
  title: string;
  duration?: number; // in minutes, for calendar events
  taskType?: TaskType; // for templates
  priority?: 'low' | 'medium' | 'high'; // for templates
}

// API Response types for proper typing
export interface ApiError {
  error: string;
}

export interface ApiSuccess {
  success: true;
}

// Calendar API responses
export type CalendarEventResponse = CalendarEvent & {
  integrationId: string;
  integrationName: string;
};

export type CalendarEventsResponse = CalendarEventResponse[];

// Settings API response (sanitized, no secrets)
export interface SettingsResponse {
  googleIntegrations: Array<{
    id: string;
    name: string;
    enabled: boolean;
    connected: boolean;
  }>;
  asanaIntegrations: Array<{
    id: string;
    name: string;
    enabled: boolean;
    connected: boolean;
  }>;
}

// Toast notification types
export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

// Frequently used task templates - can be dragged multiple times as templates
export interface TaskTemplate {
  id: string;
  title: string;
  description?: string;
  duration: number; // default duration in minutes
  priority: 'low' | 'medium' | 'high';
  taskType: TaskType;
  createdAt: string;
}
