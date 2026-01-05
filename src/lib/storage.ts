// Local storage utilities for ad-hoc tasks and scheduled Asana tasks
// Integration settings are now stored server-side in .data/integrations.json

import { AdHocTask, ScheduledAsanaTask } from '@/types';

const TASKS_KEY = 'daily-planner-adhoc-tasks';
const SCHEDULED_ASANA_KEY = 'daily-planner-scheduled-asana';

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
    return JSON.parse(stored);
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
  duration: number
): ScheduledAsanaTask {
  const tasks = getScheduledAsanaTasks();

  // Remove existing schedule for this task if any
  const filtered = tasks.filter(t => t.asanaTaskId !== asanaTaskId);

  const scheduled: ScheduledAsanaTask = {
    asanaTaskId,
    integrationId,
    scheduledDate,
    scheduledTime,
    duration,
  };

  filtered.push(scheduled);
  saveScheduledAsanaTasks(filtered);

  return scheduled;
}

export function updateScheduledAsanaTask(
  asanaTaskId: string,
  updates: Partial<ScheduledAsanaTask>
): ScheduledAsanaTask | null {
  const tasks = getScheduledAsanaTasks();
  const index = tasks.findIndex(t => t.asanaTaskId === asanaTaskId);

  if (index === -1) return null;

  tasks[index] = {
    ...tasks[index],
    ...updates,
  };

  saveScheduledAsanaTasks(tasks);
  return tasks[index];
}

export function unscheduleAsanaTask(asanaTaskId: string): boolean {
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
