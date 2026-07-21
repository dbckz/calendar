// Task deferrals (taskId → yyyy-MM-dd resume date). A deferred task is excluded
// from the current week's candidate pool until its resume date arrives.

import { getUserData, saveUserData } from './core';

export async function getTaskDeferrals(): Promise<Record<string, string>> {
  const data = await getUserData();
  return data.taskDeferrals || {};
}

// Upsert deferrals; a later call for the same taskId overwrites its resume date.
export async function setTaskDeferrals(
  entries: Array<{ taskId: string; until: string }>
): Promise<void> {
  if (entries.length === 0) return;
  const data = await getUserData();
  const next = { ...(data.taskDeferrals || {}) };
  for (const { taskId, until } of entries) next[taskId] = until;
  data.taskDeferrals = next;
  await saveUserData(data);
}

// Remove deferrals by taskId (e.g. lazily pruning expired ones). Returns the
// number removed.
export async function removeTaskDeferrals(taskIds: string[]): Promise<number> {
  if (taskIds.length === 0) return 0;
  const data = await getUserData();
  if (!data.taskDeferrals) return 0;
  let removed = 0;
  for (const id of taskIds) {
    if (data.taskDeferrals[id]) {
      delete data.taskDeferrals[id];
      removed++;
    }
  }
  if (removed > 0) await saveUserData(data);
  return removed;
}
