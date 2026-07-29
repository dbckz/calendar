// Type-label verdicts: the Type the user actually decided for a task in the
// plan-week wizard's type step, keyed by NORMALISED TASK TITLE. Written when he
// applies the step (whether he accepted the AI's suggestion or overrode it), read
// by the Type classifier to feed his own decisions back as few-shot examples.
//
// Keyed by title, not gid, on purpose: a gid teaches nothing about the next task,
// but "titles like this → Engagement" generalises. Keys are already normalized by
// the caller (see normalizeTaskTitleKey in type-classifier.ts).

import { getUserData, saveUserData } from './core';
import type { TypeVerdict } from './core';

export type { TypeVerdict };

export async function getTypeVerdicts(): Promise<Record<string, TypeVerdict>> {
  const data = await getUserData();
  return data.typeVerdicts || {};
}

// Upsert verdicts; a later decision for the same title overwrites the earlier one
// (Dave can retype a task). A blank key or label is skipped.
export async function setTypeVerdicts(
  entries: Array<{ key: string; type: string; override?: boolean; at?: string }>
): Promise<void> {
  const clean = entries.filter(e => e.key.trim() && e.type.trim());
  if (clean.length === 0) return;
  const data = await getUserData();
  const next = { ...(data.typeVerdicts || {}) };
  for (const { key, type, override, at } of clean) {
    next[key] = {
      type,
      ...(override ? { override: true } : {}),
      updatedAt: at ?? new Date().toISOString(),
    };
  }
  data.typeVerdicts = next;
  await saveUserData(data);
}
