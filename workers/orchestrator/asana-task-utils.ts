import type { AsanaTag, PlannerTask } from './types';

export function hasTag(task: PlannerTask, tagName: string): boolean {
  return (task.tags || []).some(tag => tag.name.toLowerCase() === tagName.toLowerCase());
}

export function getTag(task: PlannerTask, tagName: string): AsanaTag | null {
  return (task.tags || []).find(tag => tag.name.toLowerCase() === tagName.toLowerCase()) || null;
}

export function resolveWorkspaceTag(tags: AsanaTag[] | undefined, tagName: string): AsanaTag | null {
  return (tags || []).find(tag => tag.name.toLowerCase() === tagName.toLowerCase()) || null;
}

export function taskUrl(taskId: string): string {
  return `https://app.asana.com/0/0/${taskId}`;
}
