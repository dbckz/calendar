// Dave's own AI-runnable verdicts (keyed by Asana task GID).
//
// The AI classifier proposes; Dave disposes. A verdict written here is the
// final word for that task — the assessment review writes one when he rejects a
// claim, and every later assessment defers to it (see resolveAiSuitability).

import { getUserData, saveUserData } from './core';
import type { AiUserVerdict } from '@/types';

export async function getAiUserVerdicts(): Promise<Record<string, AiUserVerdict>> {
  const data = await getUserData();
  return data.aiUserVerdicts || {};
}

// Upsert verdicts; a later verdict for the same gid replaces the earlier one
// (Dave can change his mind).
export async function setAiUserVerdicts(
  entries: Array<{ gid: string; aiSuitable: boolean; decidedAt?: string }>
): Promise<void> {
  if (entries.length === 0) return;
  const data = await getUserData();
  const next = { ...(data.aiUserVerdicts || {}) };
  for (const { gid, aiSuitable, decidedAt } of entries) {
    next[gid] = { aiSuitable, decidedAt: decidedAt ?? new Date().toISOString() };
  }
  data.aiUserVerdicts = next;
  await saveUserData(data);
}

// Drop verdicts by gid (e.g. Dave re-enables a task by hand). Returns the count.
export async function removeAiUserVerdicts(gids: string[]): Promise<number> {
  if (gids.length === 0) return 0;
  const data = await getUserData();
  if (!data.aiUserVerdicts) return 0;
  let removed = 0;
  for (const gid of gids) {
    if (data.aiUserVerdicts[gid]) {
      delete data.aiUserVerdicts[gid];
      removed++;
    }
  }
  if (removed > 0) await saveUserData(data);
  return removed;
}
