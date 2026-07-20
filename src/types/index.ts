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
  calendarId?: string;       // Google sub-calendar ID (for mutations)
  calendarName?: string;     // Display name of the sub-calendar
  recurringEventId?: string; // Set when this event is an instance of a recurring series
  attendeeCount?: number;    // Number of attendees on the event (separates meetings from solo blocks)
  // Asana-specific fields
  projects?: Array<{ gid: string; name: string }>;
  customFields?: AsanaCustomField[];
  tags?: AsanaTag[];
  parentTask?: { gid: string; name: string };
  // Link to Asana task (when Google event represents a scheduled Asana task)
  linkedAsanaTaskId?: string;
  linkedAsanaIntegrationId?: string;
}

export interface AsanaCustomField {
  gid: string;
  name: string;
  displayValue: string | null;
  type: string;
  enumValueGid?: string; // GID of the selected enum option (for enum fields)
  enumOptions?: Array<{ gid: string; name: string }>;
}

export interface AsanaTag {
  gid: string;
  name: string;
  color?: string | null;
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
  tags?: AsanaTag[];
  parent?: {
    gid: string;
    name: string;
  };
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

export type AsanaGroupBy = 'none' | 'type';

// Orchestrator worker status (written by workers/orchestrator, read via
// /api/orchestrator/status). Mirrors workers/orchestrator/status.ts.
export interface OrchestratorHistoryEntry {
  ranAt: string;
  taskGid: string | null;
  title: string | null;
  finalStatus: string;
  summary: string;
}

export interface OrchestratorStatus {
  lastRunAt: string | null;
  running: { pid: number; startedAt: string; heartbeatAt: string } | null;
  currentTask?: { gid: string; title: string };
  history: OrchestratorHistoryEntry[];
  // Usage-limit backoff: when the CLI reports it hit a limit, the pacer parses
  // the reset time and records it here so subsequent ticks skip until then.
  pausedUntil?: string | null;
}

// App-owned delegation queue (keyed by Asana task GID inside user-data.json).
// The app owns discovery (delegate = enqueue); the launchd pacer owns pacing
// (drain the queue at a sustainable rate). Asana agent_* tags are kept as
// decoration for visibility, but this queue is the protocol.
export type DelegationMode = 'now' | 'background';
export type DelegationState = 'queued' | 'running' | 'done' | 'failed';

export interface DelegationRunResult {
  status: 'successful' | 'failed';
  summary: string;
  outputs: string[];
  next: string;
  reportMarkdown: string;   // full assistant result text
  sessionId: string | null; // for `claude --resume`
  traceFile: string | null; // basename of the per-run JSONL trace under AGENT_RUNS_DIR
  finishedAt: string;
}

export interface DelegationQueueEntry {
  asanaTaskGid: string;
  integrationId: string;
  title: string;
  brief: string;             // plain-English instruction (no magic syntax)
  mode: DelegationMode;
  state: DelegationState;
  priority: number;          // lower = sooner; default 0
  enqueuedAt: string;
  startedAt?: string;
  result?: DelegationRunResult;
  updatedAt: string;
}

export interface AsanaFilterState {
  integrationIds: string[];
  projectIds: string[];
  typeValues: string[]; // Custom field "Type" values
  dueDateRange: AsanaDateFilter;
  startDateRange: AsanaDateFilter;
  filterLogic: AsanaFilterLogic;
  sortField: AsanaSortField;
  sortDirection: AsanaSortDirection;
  groupBy: AsanaGroupBy;
  groupOrder: string[]; // Custom order of group names (when groupBy is active)
  expandedGroups: string[]; // Groups that are expanded (persisted across refresh)
}

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

// Local schedule for Asana tasks (stored server-side in .data/user-data.json)
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

export interface GoogleSubCalendar {
  id: string;          // e.g., 'primary', 'family123@group.calendar.google.com'
  summary: string;     // Display name, e.g., "Joneses"
  backgroundColor: string;  // e.g., '#7986cb'
  selected: boolean;   // Whether user wants to fetch events from this calendar
}

export interface GoogleIntegration extends IntegrationBase {
  type: 'google';
  clientId: string;
  clientSecret: string;
  credentials?: GoogleCalendarCredentials;
  calendars?: GoogleSubCalendar[];  // undefined means legacy = fetch only 'primary'
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

// Calendar API responses
export type CalendarEventResponse = CalendarEvent & {
  integrationId: string;
  integrationName: string;
};

export type CalendarEventsResponse = CalendarEventResponse[];

// Cache types
export interface CacheMetadata {
  version: number;
  lastUpdated: string;
}

export interface GoogleCalendarCache {
  events: CalendarEvent[];
  metadata: CacheMetadata;
}

export interface AsanaTasksCache {
  allTasks: CalendarEvent[];
  scheduledTasks: ScheduledAsanaTask[];
  metadata: CacheMetadata;
}

// Settings API response (sanitized, no secrets)
export interface SettingsResponse {
  googleIntegrations: Array<{
    id: string;
    name: string;
    enabled: boolean;
    connected: boolean;
    calendars?: GoogleSubCalendar[];
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
  group?: string; // group name for organization
  createdAt: string;
}

// Reminder checklist item
export interface Reminder {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
}

// Groups for organizing task templates
export interface TemplateGroup {
  id: string;
  name: string;
  order: number;
}

// Enrichment metadata attached to an Asana task (keyed by task GID).
// Used for ranking in the Command Center and, later, for auto-scheduling.
export type EnergyLevel = 'high' | 'medium' | 'low';
export type DeadlineType = 'hard' | 'soft' | 'aspirational';
export type BestTime = 'morning' | 'afternoon' | 'evening';

export interface TaskMetadata {
  asanaTaskGid: string;
  integrationId: string;
  energyLevel?: EnergyLevel;
  aiDelegable?: boolean;
  deadlineType?: DeadlineType;
  bestTime?: BestTime;
  effortMinutes?: number;
  dependsOn?: string[]; // GIDs of tasks this depends on
  updatedAt: string;
}

// Cached AI-suitability verdict for a task (keyed by Asana GID). Lets the
// "Re-assess AI-runnable" action skip tasks whose content and the classifier
// prompt are both unchanged since the last run.
export interface AiClassificationEntry {
  contentHash: string;   // fingerprint of title+description at assessment time
  promptVersion: string; // version of the classifier prompt used
  aiSuitable: boolean;
  reason: string;
  assessedAt: string;
}

// Cached staleness verdict for a task (keyed by Asana GID) — feeds the
// "Triage stale" review. Cached by content hash + prompt version like above.
export interface StaleClassificationEntry {
  contentHash: string;
  promptVersion: string;
  stale: boolean;
  reason: string;
  assessedAt: string;
}

// Remembered "does this meeting need a prep block?" decision, keyed by a
// normalized meeting title. User decisions are permanent; AI decisions carry a
// content hash + prompt version so they can be re-used or re-assessed.
export interface MeetingPrepDecision {
  needsPrep: boolean;
  decidedBy: 'user' | 'ai';
  contentHash?: string;  // ai entries only — cache key
  promptVersion?: string;
  updatedAt: string;
}
