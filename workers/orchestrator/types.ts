// Shared types for the orchestrator worker. These mirror the shapes returned by
// the calendar app's HTTP API (CalendarEvent + Asana tags/stories) but are kept
// local so the worker never imports app source.

export interface AsanaTag {
  gid: string;
  name: string;
  color?: string | null;
}

export interface AsanaCustomField {
  gid: string;
  name: string;
  displayValue: string | null;
  type?: string;
  enumOptions?: Array<{ gid: string; name: string }>;
}

export interface PlannerTask {
  id: string;
  title: string;
  description?: string;
  completed?: boolean;
  dueOn?: string;
  integrationId?: string;
  integrationName?: string;
  tags?: AsanaTag[];
  customFields?: AsanaCustomField[];
}

export interface EligibleTask extends PlannerTask {
  integrationId: string;
  containers: string[];
}

export interface AsanaStory {
  gid: string;
  text?: string;
  createdAt?: string;
  createdBy?: { name?: string };
}

export type ReportStatus = 'successful' | 'failed';

export interface ContainerReport {
  status: ReportStatus;
  summary: string;
  outputs: string[];
  next: string;
}
