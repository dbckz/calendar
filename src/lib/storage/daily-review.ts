// Daily-review state: the timestamp of the last completed review (so the next
// review only covers what finished SINCE then), the bare calendar event titles
// the user has dismissed as "not a task", and the cached "is this a task at all?"
// verdicts behind that filter.

import { getUserData, saveUserData } from './core';
import type { DailyReviewState, ReviewTitleVerdict } from './core';

export async function getDailyReviewState(): Promise<Required<DailyReviewState>> {
  const data = await getUserData();
  const state = data.dailyReviewState ?? {};
  return {
    lastReviewedAt: state.lastReviewedAt ?? '',
    dismissedTitles: state.dismissedTitles ?? [],
    titleVerdicts: state.titleVerdicts ?? {},
  };
}

// Stamp the review as completed now. Called when the user applies the review's
// "what got done" step, so subsequent reviews start from this moment.
export async function setDailyReviewLastReviewed(iso: string): Promise<void> {
  const data = await getUserData();
  data.dailyReviewState = { ...(data.dailyReviewState ?? {}), lastReviewedAt: iso };
  await saveUserData(data);
}

// Remember a calendar event title as "not a task" so it never reappears in the
// review. Titles are stored trimmed; adding an existing one is a no-op. The
// dismissal is also recorded as a permanent 'user' verdict under `key` (the
// normalized title), so the AI classifier never second-guesses it and a variant
// spelling of the same title is caught too.
export async function addDismissedReviewTitle(title: string, key?: string): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) return;
  const data = await getUserData();
  const current = data.dailyReviewState ?? {};
  const dismissed = current.dismissedTitles ?? [];
  const next: DailyReviewState = {
    ...current,
    dismissedTitles: dismissed.includes(trimmed) ? dismissed : [...dismissed, trimmed],
  };
  if (key) {
    next.titleVerdicts = {
      ...(current.titleVerdicts ?? {}),
      [key]: {
        isTask: false,
        decidedBy: 'user',
        reason: 'You marked this "not a task"',
        updatedAt: new Date().toISOString(),
      },
    };
  }
  data.dailyReviewState = next;
  await saveUserData(data);
}

// Record that the user engaged with these calendar-event titles in the review:
// marking a bare calendar row Done / Started / Didn't-do is an implicit "yes,
// this IS a task". Written as permanent 'user' verdicts (isTask:true), keyed by
// normalized title, so the classifier learns his POSITIVES too — without this the
// only user verdicts are dismissals and the example set drifts all-negative.
//
// An explicit dismissal (a 'user' isTask:false) is the stronger signal and is
// NEVER overwritten by this implicit positive. Keys are already normalized.
export async function confirmReviewTitleTasks(keys: string[]): Promise<void> {
  const unique = [...new Set(keys.map(k => k.trim()).filter(Boolean))];
  if (unique.length === 0) return;
  const data = await getUserData();
  const current = data.dailyReviewState ?? {};
  const existing = current.titleVerdicts ?? {};
  const merged = { ...existing };
  const now = new Date().toISOString();
  let changed = false;
  for (const key of unique) {
    const prior = existing[key];
    // A user's own verdict (dismissal or an earlier confirmation) already stands —
    // never overwrite it with this weaker, implicit positive.
    if (prior?.decidedBy === 'user') continue;
    merged[key] = {
      isTask: true,
      decidedBy: 'user',
      reason: 'You reviewed this event in the daily review',
      updatedAt: now,
    };
    changed = true;
  }
  if (!changed) return;
  data.dailyReviewState = { ...current, titleVerdicts: merged };
  await saveUserData(data);
}

// Merge a batch of AI "is this a task?" verdicts into the store. A verdict the
// user decided is never overwritten — his call stands.
export async function mergeReviewTitleVerdicts(
  verdicts: Record<string, ReviewTitleVerdict>
): Promise<void> {
  const keys = Object.keys(verdicts);
  if (keys.length === 0) return;
  const data = await getUserData();
  const current = data.dailyReviewState ?? {};
  const existing = current.titleVerdicts ?? {};
  const merged = { ...existing };
  for (const key of keys) {
    if (existing[key]?.decidedBy === 'user') continue;
    merged[key] = verdicts[key];
  }
  data.dailyReviewState = { ...current, titleVerdicts: merged };
  await saveUserData(data);
}
