// Ad-hoc tasks (one-off tasks the user adds directly, not from Asana).

import { AdHocTask } from '@/types';
import { getUserData, saveUserData } from './core';

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
