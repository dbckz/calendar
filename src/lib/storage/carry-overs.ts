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

// Record a carry. An existing entry has its streak INCREMENTED (that is the
// point: a task carried three weeks running is a different problem from one
// carried once) and its fromWeek moved to the week just ended. Carrying twice
// out of the SAME week is idempotent — it counts once.
export async function setCarryOvers(
  entries: Array<{ taskId: string; fromWeek: string; at?: number; mustDo?: boolean }>
): Promise<void> {
  if (entries.length === 0) return;
  const data = await getUserData();
  const next = { ...(data.carryOvers || {}) };
  for (const { taskId, fromWeek, at, mustDo } of entries) {
    const existing = next[taskId];
    const sameWeekAgain = existing?.fromWeek === fromWeek;
    const carries = existing ? (existing.carries ?? 1) + (sameWeekAgain ? 0 : 1) : 1;
    next[taskId] = {
      ...existing,
      fromWeek,
      at: at ?? Date.now(),
      carries,
      ...(mustDo !== undefined ? { mustDo } : {}),
    };
  }
  data.carryOvers = next;
  await saveUserData(data);
}

// Stamp the week a carried task was actually scheduled into. Keeps the entry
// (and therefore the streak) alive across the schedule → not-done → carry cycle;
// completion is what removes it.
export async function markCarryOversScheduled(
  taskIds: string[],
  weekStart: string
): Promise<void> {
  if (taskIds.length === 0) return;
  const data = await getUserData();
  const current = data.carryOvers || {};
  const next = { ...current };
  let changed = false;
  for (const taskId of taskIds) {
    const existing = next[taskId];
    if (!existing || existing.scheduledWeek === weekStart) continue;
    next[taskId] = { ...existing, scheduledWeek: weekStart };
    changed = true;
  }
  if (!changed) return;
  data.carryOvers = next;
  await saveUserData(data);
}

// Set (or clear) the must-do flag on carried tasks, from the end-of-week review's
// escalation options.
export async function setCarryOverMustDo(taskIds: string[], mustDo: boolean): Promise<void> {
  if (taskIds.length === 0) return;
  const data = await getUserData();
  const next = { ...(data.carryOvers || {}) };
  let changed = false;
  for (const taskId of taskIds) {
    const existing = next[taskId];
    if (!existing) continue;
    next[taskId] = { ...existing, mustDo };
    changed = true;
  }
  if (!changed) return;
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
