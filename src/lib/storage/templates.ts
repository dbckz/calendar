// Task templates, custom task types, and template groups.

import { TaskTemplate, CustomTaskType, TemplateGroup } from '@/types';
import { getUserData, saveUserData } from './core';

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
