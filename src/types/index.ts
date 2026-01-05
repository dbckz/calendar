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
  integrationId?: string;
  integrationName?: string;
}

export interface AsanaTask {
  id: string;
  gid: string;
  name: string;
  notes?: string;
  dueOn?: string;
  dueAt?: string;
  completed: boolean;
  assignee?: {
    gid: string;
    name: string;
  };
  projects?: Array<{
    gid: string;
    name: string;
  }>;
}

export type TaskType =
  | 'flight'
  | 'train'
  | 'car'
  | 'walk'
  | 'writing'
  | 'reading'
  | 'focus'
  | 'email'
  | 'batch'
  | 'other';

export const TASK_TYPE_EMOJIS: Record<TaskType, string> = {
  flight: '✈️',
  train: '🚂',
  car: '🚗',
  walk: '🚶',
  writing: '✍️',
  reading: '📖',
  focus: '🎯',
  email: '📧',
  batch: '📦',
  other: '📌',
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  flight: 'Flight',
  train: 'Train',
  car: 'Car',
  walk: 'Walk',
  writing: 'Writing',
  reading: 'Reading',
  focus: 'Focus time',
  email: 'Email',
  batch: 'Batch',
  other: 'Other',
};

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
export interface ScheduledAsanaTask {
  asanaTaskId: string;
  integrationId?: string;
  scheduledDate: string; // yyyy-MM-dd
  scheduledTime: string; // HH:mm
  duration: number; // in minutes
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
  type: 'asana-task' | 'adhoc-task' | 'calendar-event';
  id: string;
  source: 'asana' | 'adhoc' | 'google';
  title: string;
  duration?: number; // in minutes, for calendar events
}
