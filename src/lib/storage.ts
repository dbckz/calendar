// Local storage utilities for ad-hoc tasks and scheduled Asana tasks
// Integration settings are now stored server-side in .data/integrations.json

import { AdHocTask, ScheduledAsanaTask, TaskTemplate, CustomTaskType } from '@/types';

const TASKS_KEY = 'daily-planner-adhoc-tasks';
const SCHEDULED_ASANA_KEY = 'daily-planner-scheduled-asana';
const TASK_TEMPLATES_KEY = 'daily-planner-task-templates';
const CUSTOM_TASK_TYPES_KEY = 'daily-planner-custom-task-types';

// Ad-hoc task functions
export function getAdHocTasks(): AdHocTask[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(TASKS_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function saveAdHocTasks(tasks: AdHocTask[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

export function addAdHocTask(task: Omit<AdHocTask, 'id' | 'createdAt' | 'updatedAt'>): AdHocTask {
  const tasks = getAdHocTasks();
  const now = new Date().toISOString();

  const newTask: AdHocTask = {
    ...task,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };

  tasks.push(newTask);
  saveAdHocTasks(tasks);

  return newTask;
}

export function updateAdHocTask(id: string, updates: Partial<AdHocTask>): AdHocTask | null {
  const tasks = getAdHocTasks();
  const index = tasks.findIndex(t => t.id === id);

  if (index === -1) return null;

  tasks[index] = {
    ...tasks[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  saveAdHocTasks(tasks);
  return tasks[index];
}

export function deleteAdHocTask(id: string): boolean {
  const tasks = getAdHocTasks();
  const filtered = tasks.filter(t => t.id !== id);

  if (filtered.length === tasks.length) return false;

  saveAdHocTasks(filtered);
  return true;
}

export function getTasksForDate(date: string): AdHocTask[] {
  const tasks = getAdHocTasks();
  return tasks.filter(task => task.dueDate === date);
}

// Scheduled Asana task functions (local schedule overlay)
export function getScheduledAsanaTasks(): ScheduledAsanaTask[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(SCHEDULED_ASANA_KEY);
  if (!stored) return [];

  try {
    const tasks = JSON.parse(stored) as ScheduledAsanaTask[];

    // Migration: Add 'id' field to any legacy entries that don't have one
    let needsMigration = false;
    const migratedTasks = tasks.map(task => {
      if (!task.id) {
        needsMigration = true;
        return { ...task, id: crypto.randomUUID() };
      }
      return task;
    });

    if (needsMigration) {
      saveScheduledAsanaTasks(migratedTasks);
      return migratedTasks;
    }

    return tasks;
  } catch {
    return [];
  }
}

export function saveScheduledAsanaTasks(tasks: ScheduledAsanaTask[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SCHEDULED_ASANA_KEY, JSON.stringify(tasks));
}

export function scheduleAsanaTask(
  asanaTaskId: string,
  integrationId: string | undefined,
  scheduledDate: string,
  scheduledTime: string,
  duration: number,
  googleEventId?: string,
  googleIntegrationId?: string
): ScheduledAsanaTask {
  const tasks = getScheduledAsanaTasks();

  // Create a new schedule entry (same task can have multiple entries)
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

  tasks.push(scheduled);
  saveScheduledAsanaTasks(tasks);

  return scheduled;
}

export function updateScheduledAsanaTask(
  scheduleId: string,
  updates: Partial<ScheduledAsanaTask>
): ScheduledAsanaTask | null {
  const tasks = getScheduledAsanaTasks();
  const index = tasks.findIndex(t => t.id === scheduleId);

  if (index === -1) return null;

  tasks[index] = {
    ...tasks[index],
    ...updates,
  };

  saveScheduledAsanaTasks(tasks);
  return tasks[index];
}

// Update a schedule entry by its linked Google event ID
export function updateScheduledAsanaTaskByGoogleEvent(
  googleEventId: string,
  updates: Partial<ScheduledAsanaTask>
): ScheduledAsanaTask | null {
  const tasks = getScheduledAsanaTasks();
  const index = tasks.findIndex(t => t.googleEventId === googleEventId);

  if (index === -1) return null;

  tasks[index] = {
    ...tasks[index],
    ...updates,
  };

  saveScheduledAsanaTasks(tasks);
  return tasks[index];
}

// Remove a single schedule entry by its ID
export function unscheduleAsanaTask(scheduleId: string): boolean {
  const tasks = getScheduledAsanaTasks();
  const filtered = tasks.filter(t => t.id !== scheduleId);

  if (filtered.length === tasks.length) return false;

  saveScheduledAsanaTasks(filtered);
  return true;
}

// Remove all schedule entries for a given Asana task
export function unscheduleAllAsanaTaskInstances(asanaTaskId: string): boolean {
  const tasks = getScheduledAsanaTasks();
  const filtered = tasks.filter(t => t.asanaTaskId !== asanaTaskId);

  if (filtered.length === tasks.length) return false;

  saveScheduledAsanaTasks(filtered);
  return true;
}

export function getScheduledAsanaTasksForDate(date: string): ScheduledAsanaTask[] {
  const tasks = getScheduledAsanaTasks();
  return tasks.filter(task => task.scheduledDate === date);
}

// Task template functions (frequently used tasks)
export function getTaskTemplates(): TaskTemplate[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(TASK_TEMPLATES_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function saveTaskTemplates(templates: TaskTemplate[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TASK_TEMPLATES_KEY, JSON.stringify(templates));
}

export function addTaskTemplate(template: Omit<TaskTemplate, 'id' | 'createdAt'>): TaskTemplate {
  const templates = getTaskTemplates();
  const now = new Date().toISOString();

  const newTemplate: TaskTemplate = {
    ...template,
    id: crypto.randomUUID(),
    createdAt: now,
  };

  templates.push(newTemplate);
  saveTaskTemplates(templates);

  return newTemplate;
}

export function updateTaskTemplate(id: string, updates: Partial<TaskTemplate>): TaskTemplate | null {
  const templates = getTaskTemplates();
  const index = templates.findIndex(t => t.id === id);

  if (index === -1) return null;

  templates[index] = {
    ...templates[index],
    ...updates,
  };

  saveTaskTemplates(templates);
  return templates[index];
}

export function deleteTaskTemplate(id: string): boolean {
  const templates = getTaskTemplates();
  const filtered = templates.filter(t => t.id !== id);

  if (filtered.length === templates.length) return false;

  saveTaskTemplates(filtered);
  return true;
}

// Custom task type functions
export function getCustomTaskTypes(): CustomTaskType[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(CUSTOM_TASK_TYPES_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function saveCustomTaskTypes(types: CustomTaskType[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CUSTOM_TASK_TYPES_KEY, JSON.stringify(types));
}

export function addCustomTaskType(type: Omit<CustomTaskType, 'id' | 'createdAt'>): CustomTaskType {
  const types = getCustomTaskTypes();
  const now = new Date().toISOString();

  const newType: CustomTaskType = {
    ...type,
    id: crypto.randomUUID(),
    createdAt: now,
  };

  types.push(newType);
  saveCustomTaskTypes(types);

  return newType;
}

export function deleteCustomTaskType(id: string): boolean {
  const types = getCustomTaskTypes();
  const filtered = types.filter(t => t.id !== id);

  if (filtered.length === types.length) return false;

  saveCustomTaskTypes(filtered);
  return true;
}
