// Local storage utilities for settings and ad-hoc tasks

import { AdHocTask, AppSettings } from '@/types';

const SETTINGS_KEY = 'daily-planner-settings';
const TASKS_KEY = 'daily-planner-adhoc-tasks';

// Default settings
export const defaultSettings: AppSettings = {
  googleCalendar: {
    enabled: false,
    clientId: '',
    clientSecret: '',
  },
  asana: {
    enabled: false,
    accessToken: '',
  },
};

// Settings functions
export function getSettings(): AppSettings {
  if (typeof window === 'undefined') return defaultSettings;

  const stored = localStorage.getItem(SETTINGS_KEY);
  if (!stored) return defaultSettings;

  try {
    return { ...defaultSettings, ...JSON.parse(stored) };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function clearSettings(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SETTINGS_KEY);
}

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
