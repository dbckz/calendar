// Cached task classifications: AI-suitability verdicts, staleness verdicts, and
// the "keep active" snoozes that suppress staleness for a task.

import { AiClassificationEntry, StaleClassificationEntry } from '@/types';
import { getUserData, saveUserData } from './core';

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

// Staleness classification cache + "keep active" snoozes (both keyed by GID).
export async function getStaleData(): Promise<{
  staleClassification: Record<string, StaleClassificationEntry>;
  staleKeep: Record<string, string>;
}> {
  const data = await getUserData();
  return { staleClassification: data.staleClassification || {}, staleKeep: data.staleKeep || {} };
}

export async function saveStaleClassification(entries: Record<string, StaleClassificationEntry>): Promise<void> {
  const data = await getUserData();
  data.staleClassification = { ...(data.staleClassification || {}), ...entries };
  await saveUserData(data);
}

// Mark a task "keep active": snooze it out of the stale list until `until`.
export async function setStaleKeep(asanaTaskGid: string, until: string): Promise<void> {
  const data = await getUserData();
  data.staleKeep = { ...(data.staleKeep || {}), [asanaTaskGid]: until };
  await saveUserData(data);
}
