// Server-side storage for user data (task templates, custom types, ad-hoc tasks, scheduled tasks)
// Uses file-based storage in ~/.claude/data/calendar/ for persistence across builds

import { promises as fs } from 'fs';
import { AdHocTask, ScheduledAsanaTask, TaskTemplate, CustomTaskType, AsanaFilterState, TemplateGroup, TaskMetadata, DelegationQueueEntry, AiClassificationEntry } from '@/types';
import { DATA_DIR, USER_DATA_FILE } from './data-paths';

const DEFAULT_ASANA_FILTERS: AsanaFilterState = {
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

interface UserData {
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
};

async function ensureDataDir(): Promise<void> {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

export async function getUserData(): Promise<UserData> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(USER_DATA_FILE, 'utf-8');
    const parsed = JSON.parse(data) as Partial<UserData>;

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
    };
  } catch {
    // Deep clone so callers that mutate nested collections (e.g. upserting into
    // delegationQueue/taskMetadata) never pollute the shared DEFAULT_USER_DATA.
    return JSON.parse(JSON.stringify(DEFAULT_USER_DATA)) as UserData;
  }
}

export async function saveUserData(data: UserData): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(USER_DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// Task Templates
export async function getTaskTemplates(): Promise<TaskTemplate[]> {
  const data = await getUserData();
  return data.taskTemplates;
}

export async function addTaskTemplate(template: Omit<TaskTemplate, 'id' | 'createdAt'>): Promise<TaskTemplate> {
  const data = await getUserData();
  const now = new Date().toISOString();

  const newTemplate: TaskTemplate = {
    ...template,
    id: crypto.randomUUID(),
    createdAt: now,
  };

  data.taskTemplates.push(newTemplate);
  await saveUserData(data);

  return newTemplate;
}

export async function updateTaskTemplate(id: string, updates: Partial<TaskTemplate>): Promise<TaskTemplate | null> {
  const data = await getUserData();
  const index = data.taskTemplates.findIndex(t => t.id === id);

  if (index === -1) return null;

  data.taskTemplates[index] = {
    ...data.taskTemplates[index],
    ...updates,
  };

  await saveUserData(data);
  return data.taskTemplates[index];
}

export async function deleteTaskTemplate(id: string): Promise<boolean> {
  const data = await getUserData();
  const filtered = data.taskTemplates.filter(t => t.id !== id);

  if (filtered.length === data.taskTemplates.length) return false;

  data.taskTemplates = filtered;
  await saveUserData(data);
  return true;
}

// Custom Task Types
export async function getCustomTaskTypes(): Promise<CustomTaskType[]> {
  const data = await getUserData();
  return data.customTaskTypes;
}

export async function addCustomTaskType(taskType: Omit<CustomTaskType, 'id' | 'createdAt'>): Promise<CustomTaskType> {
  const data = await getUserData();
  const now = new Date().toISOString();

  const newType: CustomTaskType = {
    ...taskType,
    id: crypto.randomUUID(),
    createdAt: now,
  };

  data.customTaskTypes.push(newType);
  await saveUserData(data);

  return newType;
}

export async function deleteCustomTaskType(id: string): Promise<boolean> {
  const data = await getUserData();
  const filtered = data.customTaskTypes.filter(t => t.id !== id);

  if (filtered.length === data.customTaskTypes.length) return false;

  data.customTaskTypes = filtered;
  await saveUserData(data);
  return true;
}

// Ad-Hoc Tasks
export async function getAdHocTasks(): Promise<AdHocTask[]> {
  const data = await getUserData();
  return data.adHocTasks;
}

export async function addAdHocTask(task: Omit<AdHocTask, 'id' | 'createdAt' | 'updatedAt'>): Promise<AdHocTask> {
  const data = await getUserData();
  const now = new Date().toISOString();

  const newTask: AdHocTask = {
    ...task,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };

  data.adHocTasks.push(newTask);
  await saveUserData(data);

  return newTask;
}

export async function updateAdHocTask(id: string, updates: Partial<AdHocTask>): Promise<AdHocTask | null> {
  const data = await getUserData();
  const index = data.adHocTasks.findIndex(t => t.id === id);

  if (index === -1) return null;

  data.adHocTasks[index] = {
    ...data.adHocTasks[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await saveUserData(data);
  return data.adHocTasks[index];
}

export async function deleteAdHocTask(id: string): Promise<boolean> {
  const data = await getUserData();
  const filtered = data.adHocTasks.filter(t => t.id !== id);

  if (filtered.length === data.adHocTasks.length) return false;

  data.adHocTasks = filtered;
  await saveUserData(data);
  return true;
}

// Scheduled Asana Tasks
export async function getScheduledAsanaTasks(): Promise<ScheduledAsanaTask[]> {
  const data = await getUserData();
  // Migration: Add 'id' field to any legacy entries that don't have one
  let needsMigration = false;
  const migratedTasks = data.scheduledAsanaTasks.map(task => {
    if (!task.id) {
      needsMigration = true;
      return { ...task, id: crypto.randomUUID() };
    }
    return task;
  });

  if (needsMigration) {
    data.scheduledAsanaTasks = migratedTasks;
    await saveUserData(data);
  }

  return migratedTasks;
}

export async function scheduleAsanaTask(
  asanaTaskId: string,
  integrationId: string | undefined,
  scheduledDate: string,
  scheduledTime: string,
  duration: number,
  googleEventId?: string,
  googleIntegrationId?: string
): Promise<ScheduledAsanaTask> {
  const data = await getUserData();

  const scheduled: ScheduledAsanaTask = {
    id: crypto.randomUUID(),
    asanaTaskId,
    integrationId,
    scheduledDate,
    scheduledTime,
    duration,
    googleEventId,
    googleIntegrationId,
  };

  data.scheduledAsanaTasks.push(scheduled);
  await saveUserData(data);

  return scheduled;
}

export async function updateScheduledAsanaTask(
  scheduleId: string,
  updates: Partial<ScheduledAsanaTask>
): Promise<ScheduledAsanaTask | null> {
  const data = await getUserData();
  const index = data.scheduledAsanaTasks.findIndex(t => t.id === scheduleId);

  if (index === -1) return null;

  data.scheduledAsanaTasks[index] = {
    ...data.scheduledAsanaTasks[index],
    ...updates,
  };

  await saveUserData(data);
  return data.scheduledAsanaTasks[index];
}

export async function updateScheduledAsanaTaskByGoogleEvent(
  googleEventId: string,
  updates: Partial<ScheduledAsanaTask>
): Promise<ScheduledAsanaTask | null> {
  const data = await getUserData();
  const index = data.scheduledAsanaTasks.findIndex(t => t.googleEventId === googleEventId);

  if (index === -1) return null;

  data.scheduledAsanaTasks[index] = {
    ...data.scheduledAsanaTasks[index],
    ...updates,
  };

  await saveUserData(data);
  return data.scheduledAsanaTasks[index];
}

export async function unscheduleAsanaTask(scheduleId: string): Promise<boolean> {
  const data = await getUserData();
  const filtered = data.scheduledAsanaTasks.filter(t => t.id !== scheduleId);

  if (filtered.length === data.scheduledAsanaTasks.length) return false;

  data.scheduledAsanaTasks = filtered;
  await saveUserData(data);
  return true;
}

export async function unscheduleAllAsanaTaskInstances(asanaTaskId: string): Promise<number> {
  const data = await getUserData();
  const originalLength = data.scheduledAsanaTasks.length;
  data.scheduledAsanaTasks = data.scheduledAsanaTasks.filter(t => t.asanaTaskId !== asanaTaskId);

  const removedCount = originalLength - data.scheduledAsanaTasks.length;
  if (removedCount > 0) {
    await saveUserData(data);
  }

  return removedCount;
}

export async function getScheduledAsanaTasksForDate(date: string): Promise<ScheduledAsanaTask[]> {
  const tasks = await getScheduledAsanaTasks();
  return tasks.filter(task => task.scheduledDate === date);
}

export async function getScheduleByGoogleEventId(googleEventId: string): Promise<ScheduledAsanaTask | null> {
  const tasks = await getScheduledAsanaTasks();
  return tasks.find(t => t.googleEventId === googleEventId) || null;
}

// Asana Filter Preferences (per-integration)
export async function getAsanaFilterPreferences(integrationId?: string): Promise<AsanaFilterState> {
  const data = await getUserData();
  const key = integrationId || 'default';
  const filters = data.asanaFilterPreferencesMap?.[key];
  return filters ? { ...DEFAULT_ASANA_FILTERS, ...filters } : DEFAULT_ASANA_FILTERS;
}

export async function getAllAsanaFilterPreferences(): Promise<Record<string, AsanaFilterState>> {
  const data = await getUserData();
  return data.asanaFilterPreferencesMap || {};
}

export async function saveAsanaFilterPreferences(filters: AsanaFilterState, integrationId?: string): Promise<void> {
  const data = await getUserData();
  const key = integrationId || 'default';
  if (!data.asanaFilterPreferencesMap) {
    data.asanaFilterPreferencesMap = {};
  }
  data.asanaFilterPreferencesMap[key] = filters;
  await saveUserData(data);
}

// Template Groups
export async function getTemplateGroups(): Promise<TemplateGroup[]> {
  const data = await getUserData();
  return data.templateGroups;
}

export async function addTemplateGroup(name: string): Promise<TemplateGroup> {
  const data = await getUserData();
  const maxOrder = data.templateGroups.length > 0
    ? Math.max(...data.templateGroups.map(g => g.order))
    : -1;

  const newGroup: TemplateGroup = {
    id: crypto.randomUUID(),
    name,
    order: maxOrder + 1,
  };

  data.templateGroups.push(newGroup);
  await saveUserData(data);
  return newGroup;
}

export async function updateTemplateGroup(id: string, updates: Partial<TemplateGroup>): Promise<TemplateGroup | null> {
  const data = await getUserData();
  const index = data.templateGroups.findIndex(g => g.id === id);

  if (index === -1) return null;

  data.templateGroups[index] = {
    ...data.templateGroups[index],
    ...updates,
  };

  await saveUserData(data);
  return data.templateGroups[index];
}

export async function deleteTemplateGroup(id: string): Promise<boolean> {
  const data = await getUserData();
  const filtered = data.templateGroups.filter(g => g.id !== id);

  if (filtered.length === data.templateGroups.length) return false;

  // Also remove group from any templates that had this group
  const groupToDelete = data.templateGroups.find(g => g.id === id);
  if (groupToDelete) {
    data.taskTemplates = data.taskTemplates.map(t =>
      t.group === groupToDelete.name ? { ...t, group: undefined } : t
    );
  }

  data.templateGroups = filtered;
  await saveUserData(data);
  return true;
}

export async function reorderTemplateGroups(groupIds: string[]): Promise<void> {
  const data = await getUserData();

  data.templateGroups = data.templateGroups.map(g => {
    const newOrder = groupIds.indexOf(g.id);
    return newOrder >= 0 ? { ...g, order: newOrder } : g;
  }).sort((a, b) => a.order - b.order);

  await saveUserData(data);
}

// Google Event Attributions (for time tracking)
export async function getGoogleEventAttributions(): Promise<GoogleEventAttribution[]> {
  const data = await getUserData();
  return data.googleEventAttributions || [];
}

export async function getGoogleEventAttribution(googleEventId: string): Promise<GoogleEventAttribution | null> {
  const attributions = await getGoogleEventAttributions();
  return attributions.find(a => a.googleEventId === googleEventId) || null;
}

export async function setGoogleEventAttribution(
  googleEventId: string,
  googleIntegrationId: string,
  asanaIntegrationId: string
): Promise<GoogleEventAttribution> {
  const data = await getUserData();
  if (!data.googleEventAttributions) {
    data.googleEventAttributions = [];
  }

  // Remove existing attribution for this event if any
  data.googleEventAttributions = data.googleEventAttributions.filter(
    a => a.googleEventId !== googleEventId
  );

  const attribution: GoogleEventAttribution = {
    googleEventId,
    googleIntegrationId,
    asanaIntegrationId,
    createdAt: new Date().toISOString(),
  };

  data.googleEventAttributions.push(attribution);
  await saveUserData(data);
  return attribution;
}

export async function removeGoogleEventAttribution(googleEventId: string): Promise<boolean> {
  const data = await getUserData();
  if (!data.googleEventAttributions) return false;

  const originalLength = data.googleEventAttributions.length;
  data.googleEventAttributions = data.googleEventAttributions.filter(
    a => a.googleEventId !== googleEventId
  );

  if (data.googleEventAttributions.length === originalLength) return false;

  await saveUserData(data);
  return true;
}

// Task Metadata (enrichment layer keyed by Asana task GID)
export async function getAllTaskMetadata(): Promise<Record<string, TaskMetadata>> {
  const data = await getUserData();
  return data.taskMetadata || {};
}

export async function upsertTaskMetadata(
  asanaTaskGid: string,
  integrationId: string,
  updates: Partial<Omit<TaskMetadata, 'asanaTaskGid' | 'integrationId' | 'updatedAt'>>
): Promise<TaskMetadata> {
  const data = await getUserData();
  if (!data.taskMetadata) {
    data.taskMetadata = {};
  }

  const existing = data.taskMetadata[asanaTaskGid];
  const merged: TaskMetadata = {
    ...existing,
    ...updates,
    asanaTaskGid,
    integrationId,
    updatedAt: new Date().toISOString(),
  };

  data.taskMetadata[asanaTaskGid] = merged;
  await saveUserData(data);
  return merged;
}

// Delegation queue (app-owned, keyed by Asana task GID). Mirrors the taskMetadata
// map idiom. All writes funnel through the single Next.js process (the pacer and
// the detached "Run now" child mutate via HTTP), so no file locking is needed.
export async function getAllDelegationEntries(): Promise<Record<string, DelegationQueueEntry>> {
  const data = await getUserData();
  return data.delegationQueue || {};
}

export async function getDelegationEntry(asanaTaskGid: string): Promise<DelegationQueueEntry | null> {
  const data = await getUserData();
  return data.delegationQueue?.[asanaTaskGid] || null;
}

export async function upsertDelegationEntry(
  asanaTaskGid: string,
  integrationId: string,
  updates: Partial<Omit<DelegationQueueEntry, 'asanaTaskGid' | 'integrationId' | 'updatedAt'>>
): Promise<DelegationQueueEntry> {
  const data = await getUserData();
  if (!data.delegationQueue) {
    data.delegationQueue = {};
  }

  const now = new Date().toISOString();
  // Defaults applied only on first insert; existing values win over them.
  const base: DelegationQueueEntry = data.delegationQueue[asanaTaskGid] ?? {
    asanaTaskGid,
    integrationId,
    title: '',
    brief: '',
    mode: 'background',
    state: 'queued',
    priority: 0,
    enqueuedAt: now,
    updatedAt: now,
  };
  const merged: DelegationQueueEntry = {
    ...base,
    ...updates,
    asanaTaskGid,
    integrationId,
    updatedAt: now,
  };

  data.delegationQueue[asanaTaskGid] = merged;
  await saveUserData(data);
  return merged;
}

// Atomically (within the single app process) pick the next queued entry by
// (priority asc, enqueuedAt asc), mark it running, and return it. Returns null
// when the queue has nothing to drain.
export async function claimNextDelegationEntry(): Promise<DelegationQueueEntry | null> {
  const data = await getUserData();
  const queue = data.delegationQueue || {};
  const queued = Object.values(queue)
    .filter(entry => entry.state === 'queued')
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.enqueuedAt.localeCompare(b.enqueuedAt);
    });

  const next = queued[0];
  if (!next) return null;

  const now = new Date().toISOString();
  const claimed: DelegationQueueEntry = {
    ...next,
    state: 'running',
    startedAt: now,
    updatedAt: now,
  };
  queue[next.asanaTaskGid] = claimed;
  data.delegationQueue = queue;
  await saveUserData(data);
  return claimed;
}

export async function deleteDelegationEntry(asanaTaskGid: string): Promise<boolean> {
  const data = await getUserData();
  if (!data.delegationQueue || !data.delegationQueue[asanaTaskGid]) {
    return false;
  }
  delete data.delegationQueue[asanaTaskGid];
  await saveUserData(data);
  return true;
}

// AI-suitability classification cache (keyed by Asana task GID).
export async function getAllAiClassification(): Promise<Record<string, AiClassificationEntry>> {
  const data = await getUserData();
  return data.aiClassification || {};
}

// Merge a batch of freshly-assessed verdicts into the cache in one write.
export async function saveAiClassification(entries: Record<string, AiClassificationEntry>): Promise<void> {
  const data = await getUserData();
  data.aiClassification = { ...(data.aiClassification || {}), ...entries };
  await saveUserData(data);
}

