// Core user-data assembly: the whole-object read/write that every per-domain
// module builds on. Backed by SQLite (see ./db) rather than a JSON file, but the
// external contract — a UserData object with all fields defaulted — is unchanged.

import { AsanaFilterState } from '@/types';
import { readAllDomains, writeAllDomains } from './db';
import type {
  AdHocTask,
  ScheduledAsanaTask,
  TaskTemplate,
  CustomTaskType,
  TemplateGroup,
  TaskMetadata,
  DelegationQueueEntry,
  AiClassificationEntry,
  StaleClassificationEntry,
  MeetingPrepDecision,
} from '@/types';

export const DEFAULT_ASANA_FILTERS: AsanaFilterState = {
  integrationIds: [],
  projectIds: [],
  typeValues: [],
  dueDateRange: 'all',
  startDateRange: 'all',
  filterLogic: 'and',
  sortField: 'dueOn',
  sortDirection: 'asc',
  groupBy: 'none',
  groupOrder: [],
  expandedGroups: [],
};

// Attribution for Google events to count toward time tracking
export interface GoogleEventAttribution {
  googleEventId: string;
  googleIntegrationId: string;
  asanaIntegrationId: string; // Which Asana workspace this counts toward (OM or DBC)
  createdAt: string;
}

// A meeting-prep block the "Plan my week" flow created on the calendar. Tracked
// here (not just as a "Prep:" Google event) so the planner can dedupe against
// it, reconcile it when the user deletes the event, and reason about it during
// replan (missed / mark-done / stale-when-meeting-past).
export interface PrepBlock {
  id: string;
  googleEventId: string;
  googleIntegrationId: string;
  meetingEventId: string; // the meeting this block prepares for
  meetingTitle: string;
  meetingStart: string; // ISO
  date: string; // yyyy-MM-dd (the prep block's own date)
  start: string; // HH:mm
  durationMinutes: number;
  done: boolean;
  createdAt: string;
}

// A daily-ritual block (lunch / exercise / emails) the "Plan my week" flow
// created on the calendar. Tracked here (like PrepBlock) so the planner can
// dedupe against it, reconcile it when the user deletes the event, reset it, and
// re-slot it in replan. No `done` concept — a ritual is never marked done.
export interface RitualBlock {
  id: string;
  googleEventId: string;
  googleIntegrationId: string;
  title: string; // exact event title ("🍽️ Lunch" / "🏋️ Exercise" / "📧 Emails")
  date: string; // yyyy-MM-dd
  start: string; // HH:mm
  durationMinutes: number;
  createdAt: string;
}

export interface UserData {
  taskTemplates: TaskTemplate[];
  templateGroups: TemplateGroup[];
  customTaskTypes: CustomTaskType[];
  adHocTasks: AdHocTask[];
  scheduledAsanaTasks: ScheduledAsanaTask[];
  asanaFilterPreferences?: AsanaFilterState; // Legacy: kept for migration
  asanaFilterPreferencesMap?: Record<string, AsanaFilterState>; // Key is integration ID or "default"
  googleEventAttributions?: GoogleEventAttribution[];
  taskMetadata?: Record<string, TaskMetadata>; // Key is Asana task GID
  delegationQueue?: Record<string, DelegationQueueEntry>; // Key is Asana task GID
  aiClassification?: Record<string, AiClassificationEntry>; // Key is Asana task GID
  staleClassification?: Record<string, StaleClassificationEntry>; // Key is Asana task GID
  staleKeep?: Record<string, string>; // GID -> ISO timestamp: "keep active" until (snooze)
  meetingPrepDecisions?: Record<string, MeetingPrepDecision>; // Key is normalized meeting title
  prepBlocks?: PrepBlock[]; // meeting-prep blocks created on the calendar
  ritualBlocks?: RitualBlock[]; // daily lunch/emails blocks created on the calendar
  // Google event ids the user explicitly marked "done for planning" during a
  // replan. Used for Asana-backed blocks whose task must stay open in Asana.
  blockDoneOverrides?: Record<string, true>;
  // Task ids (Asana gid or ad-hoc id) the user deferred out of the current
  // week's planning during a replan, mapped to the yyyy-MM-dd date they should
  // resume as a candidate (next Monday). Deferrals whose resume date has arrived
  // are pruned lazily by gatherWeekContext.
  taskDeferrals?: Record<string, string>;
  // Daily-review state: when the review was last completed (so the next review
  // only covers what has finished SINCE then) and the bare calendar-event titles
  // the user has dismissed as "not a task" (so they never resurface in review).
  dailyReviewState?: DailyReviewState;
}

export interface DailyReviewState {
  lastReviewedAt?: string; // ISO timestamp of the last completed daily review
  dismissedTitles?: string[]; // exact event titles to skip in calendar review
}

const DEFAULT_USER_DATA: UserData = {
  taskTemplates: [],
  templateGroups: [],
  customTaskTypes: [],
  adHocTasks: [],
  scheduledAsanaTasks: [],
  asanaFilterPreferencesMap: {},
  googleEventAttributions: [],
  taskMetadata: {},
  delegationQueue: {},
  aiClassification: {},
  staleClassification: {},
  staleKeep: {},
  meetingPrepDecisions: {},
  prepBlocks: [],
  ritualBlocks: [],
  blockDoneOverrides: {},
  taskDeferrals: {},
  dailyReviewState: {},
};

export async function getUserData(): Promise<UserData> {
  try {
    const parsed = readAllDomains() as Partial<UserData>;

    // Migrate from legacy asanaFilterPreferences to asanaFilterPreferencesMap
    let filterMap = parsed.asanaFilterPreferencesMap || {};
    if (parsed.asanaFilterPreferences && !parsed.asanaFilterPreferencesMap) {
      // Migrate legacy single filter state to "default" key
      filterMap = { default: { ...DEFAULT_ASANA_FILTERS, ...parsed.asanaFilterPreferences } };
    }

    // Ensure all fields exist (for backwards compatibility)
    return {
      taskTemplates: parsed.taskTemplates || [],
      templateGroups: parsed.templateGroups || [],
      customTaskTypes: parsed.customTaskTypes || [],
      adHocTasks: parsed.adHocTasks || [],
      scheduledAsanaTasks: parsed.scheduledAsanaTasks || [],
      asanaFilterPreferencesMap: filterMap,
      googleEventAttributions: parsed.googleEventAttributions || [],
      taskMetadata: parsed.taskMetadata || {},
      delegationQueue: parsed.delegationQueue || {},
      aiClassification: parsed.aiClassification || {},
      staleClassification: parsed.staleClassification || {},
      staleKeep: parsed.staleKeep || {},
      meetingPrepDecisions: parsed.meetingPrepDecisions || {},
      prepBlocks: parsed.prepBlocks || [],
      ritualBlocks: parsed.ritualBlocks || [],
      blockDoneOverrides: parsed.blockDoneOverrides || {},
      // Tolerant load: keep only string→string entries.
      taskDeferrals: Object.fromEntries(
        Object.entries(parsed.taskDeferrals || {}).filter(
          ([k, v]) => typeof k === 'string' && typeof v === 'string'
        )
      ),
      dailyReviewState: parsed.dailyReviewState || {},
    };
  } catch {
    // Deep clone so callers that mutate nested collections (e.g. upserting into
    // delegationQueue/taskMetadata) never pollute the shared DEFAULT_USER_DATA.
    return JSON.parse(JSON.stringify(DEFAULT_USER_DATA)) as UserData;
  }
}

export async function saveUserData(data: UserData): Promise<void> {
  writeAllDomains(data as unknown as Record<string, unknown>);
}
