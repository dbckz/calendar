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

export interface AdHocTask {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  dueTime?: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
  updatedAt: string;
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

export interface AppSettings {
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

export interface TimeSlot {
  time: string;
  hour: number;
  events: CalendarEvent[];
}

export type ViewMode = 'timeline' | 'list';
