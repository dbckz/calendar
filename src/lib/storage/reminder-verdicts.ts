// Reminder-triage verdicts: the keep-vs-convert decision (and, for a conversion,
// the destination) the user confirmed in the plan-week wizard's reminders step,
// keyed by NORMALISED REMINDER TITLE. Written when he applies the step, read by
// the reminder-triage classifier to feed his own calls back as few-shot examples.
//
// Keyed by title, not the Google Task id, on purpose: an id is single-use, but
// "reminders worded like this → keep / convert to OM" generalises. Keys are
// already normalized by the caller (see normalizeReminderKey in the classifier).

import { getUserData, saveUserData } from './core';
import type { ReminderVerdict } from './core';

export type { ReminderVerdict };

export async function getReminderVerdicts(): Promise<Record<string, ReminderVerdict>> {
  const data = await getUserData();
  return data.reminderVerdicts || {};
}

// Upsert verdicts; a later decision for the same title wins. Blank keys skipped.
export async function setReminderVerdicts(
  entries: Array<{
    key: string;
    action: 'keep' | 'convert';
    integrationId?: string;
    projectGid?: string;
    taskType?: string;
    at?: string;
  }>
): Promise<void> {
  const clean = entries.filter(e => e.key.trim());
  if (clean.length === 0) return;
  const data = await getUserData();
  const next = { ...(data.reminderVerdicts || {}) };
  for (const { key, action, integrationId, projectGid, taskType, at } of clean) {
    next[key] = {
      action,
      ...(action === 'convert' && integrationId ? { integrationId } : {}),
      ...(action === 'convert' && projectGid ? { projectGid } : {}),
      ...(action === 'convert' && taskType ? { taskType } : {}),
      updatedAt: at ?? new Date().toISOString(),
    };
  }
  data.reminderVerdicts = next;
  await saveUserData(data);
}
