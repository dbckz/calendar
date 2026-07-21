// Delegation queue (app-owned, keyed by Asana task GID). Mirrors the taskMetadata
// map idiom. All writes funnel through the single Next.js process (the pacer and
// the detached "Run now" child mutate via HTTP), so no file locking is needed.

import { DelegationQueueEntry } from '@/types';
import { getUserData, saveUserData } from './core';

export async function getAllDelegationEntries(): Promise<Record<string, DelegationQueueEntry>> {
  const data = await getUserData();
  return data.delegationQueue || {};
}

export async function getDelegationEntry(asanaTaskGid: string): Promise<DelegationQueueEntry | null> {
  const data = await getUserData();
  return data.delegationQueue?.[asanaTaskGid] || null;
}

export async function upsertDelegationEntry(
  asanaTaskGid: string,
  integrationId: string,
  updates: Partial<Omit<DelegationQueueEntry, 'asanaTaskGid' | 'integrationId' | 'updatedAt'>>
): Promise<DelegationQueueEntry> {
  const data = await getUserData();
  if (!data.delegationQueue) {
    data.delegationQueue = {};
  }

  const now = new Date().toISOString();
  // Defaults applied only on first insert; existing values win over them.
  const base: DelegationQueueEntry = data.delegationQueue[asanaTaskGid] ?? {
    asanaTaskGid,
    integrationId,
    title: '',
    brief: '',
    mode: 'background',
    state: 'queued',
    priority: 0,
    enqueuedAt: now,
    updatedAt: now,
  };
  const merged: DelegationQueueEntry = {
    ...base,
    ...updates,
    asanaTaskGid,
    integrationId,
    updatedAt: now,
  };

  data.delegationQueue[asanaTaskGid] = merged;
  await saveUserData(data);
  return merged;
}

// Atomically (within the single app process) pick the next queued entry by
// (priority asc, enqueuedAt asc), mark it running, and return it. Returns null
// when the queue has nothing to drain.
export async function claimNextDelegationEntry(): Promise<DelegationQueueEntry | null> {
  const data = await getUserData();
  const queue = data.delegationQueue || {};
  const queued = Object.values(queue)
    .filter(entry => entry.state === 'queued')
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.enqueuedAt.localeCompare(b.enqueuedAt);
    });

  const next = queued[0];
  if (!next) return null;

  const now = new Date().toISOString();
  const claimed: DelegationQueueEntry = {
    ...next,
    state: 'running',
    startedAt: now,
    updatedAt: now,
  };
  queue[next.asanaTaskGid] = claimed;
  data.delegationQueue = queue;
  await saveUserData(data);
  return claimed;
}

export async function deleteDelegationEntry(asanaTaskGid: string): Promise<boolean> {
  const data = await getUserData();
  if (!data.delegationQueue || !data.delegationQueue[asanaTaskGid]) {
    return false;
  }
  delete data.delegationQueue[asanaTaskGid];
  await saveUserData(data);
  return true;
}
