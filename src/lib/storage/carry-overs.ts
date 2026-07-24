// Task carry-overs (taskId → the week it was carried out of). Written by the
// end-of-week review's "carry over to next week" choice; read by the plan-week
// wizard so a carried task is badged and sorted to the top of its category.
//
// The marker is independent of the parallel task deferral: the deferral is what
// keeps the task out of the current week's candidate pool, this is only what
// makes the carry-over VISIBLE when planning the next week.

import { getUserData, saveUserData } from './core';
import type { CarryOverEntry } from './core';

export type { CarryOverEntry };

export async function getCarryOvers(): Promise<Record<string, CarryOverEntry>> {
  const data = await getUserData();
  return data.carryOvers || {};
}

// Upsert carry-overs; a later call for the same taskId overwrites its fromWeek
// (so a task carried two weeks running reports the most recent week).
export async function setCarryOvers(
  entries: Array<{ taskId: string; fromWeek: string; at?: number }>
): Promise<void> {
  if (entries.length === 0) return;
  const data = await getUserData();
  const next = { ...(data.carryOvers || {}) };
  for (const { taskId, fromWeek, at } of entries) next[taskId] = { fromWeek, at: at ?? Date.now() };
  data.carryOvers = next;
  await saveUserData(data);
}

// Remove carry-overs by taskId (task scheduled, completed, or entry stale).
// Returns the number removed.
export async function removeCarryOvers(taskIds: string[]): Promise<number> {
  if (taskIds.length === 0) return 0;
  const data = await getUserData();
  if (!data.carryOvers) return 0;
  let removed = 0;
  for (const id of taskIds) {
    if (data.carryOvers[id]) {
      delete data.carryOvers[id];
      removed++;
    }
  }
  if (removed > 0) await saveUserData(data);
  return removed;
}

export async function clearCarryOvers(): Promise<void> {
  const data = await getUserData();
  if (!data.carryOvers || Object.keys(data.carryOvers).length === 0) return;
  data.carryOvers = {};
  await saveUserData(data);
}
