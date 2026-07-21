// Google event → Asana workspace attributions (for time tracking) and the
// per-task metadata enrichment layer (keyed by Asana task GID).

import { TaskMetadata } from '@/types';
import { getUserData, saveUserData } from './core';
import type { GoogleEventAttribution } from './core';

// Google Event Attributions (for time tracking)
export async function getGoogleEventAttributions(): Promise<GoogleEventAttribution[]> {
  const data = await getUserData();
  return data.googleEventAttributions || [];
}

export async function getGoogleEventAttribution(googleEventId: string): Promise<GoogleEventAttribution | null> {
  const attributions = await getGoogleEventAttributions();
  return attributions.find(a => a.googleEventId === googleEventId) || null;
}

export async function setGoogleEventAttribution(
  googleEventId: string,
  googleIntegrationId: string,
  asanaIntegrationId: string
): Promise<GoogleEventAttribution> {
  const data = await getUserData();
  if (!data.googleEventAttributions) {
    data.googleEventAttributions = [];
  }

  // Remove existing attribution for this event if any
  data.googleEventAttributions = data.googleEventAttributions.filter(
    a => a.googleEventId !== googleEventId
  );

  const attribution: GoogleEventAttribution = {
    googleEventId,
    googleIntegrationId,
    asanaIntegrationId,
    createdAt: new Date().toISOString(),
  };

  data.googleEventAttributions.push(attribution);
  await saveUserData(data);
  return attribution;
}

export async function removeGoogleEventAttribution(googleEventId: string): Promise<boolean> {
  const data = await getUserData();
  if (!data.googleEventAttributions) return false;

  const originalLength = data.googleEventAttributions.length;
  data.googleEventAttributions = data.googleEventAttributions.filter(
    a => a.googleEventId !== googleEventId
  );

  if (data.googleEventAttributions.length === originalLength) return false;

  await saveUserData(data);
  return true;
}

// Task Metadata (enrichment layer keyed by Asana task GID)
export async function getAllTaskMetadata(): Promise<Record<string, TaskMetadata>> {
  const data = await getUserData();
  return data.taskMetadata || {};
}

export async function upsertTaskMetadata(
  asanaTaskGid: string,
  integrationId: string,
  updates: Partial<Omit<TaskMetadata, 'asanaTaskGid' | 'integrationId' | 'updatedAt'>>
): Promise<TaskMetadata> {
  const data = await getUserData();
  if (!data.taskMetadata) {
    data.taskMetadata = {};
  }

  const existing = data.taskMetadata[asanaTaskGid];
  const merged: TaskMetadata = {
    ...existing,
    ...updates,
    asanaTaskGid,
    integrationId,
    updatedAt: new Date().toISOString(),
  };

  data.taskMetadata[asanaTaskGid] = merged;
  await saveUserData(data);
  return merged;
}
