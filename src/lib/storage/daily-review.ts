// Daily-review state: the timestamp of the last completed review (so the next
// review only covers what finished SINCE then) and the set of bare calendar
// event titles the user has dismissed as "not a task".

import { getUserData, saveUserData } from './core';
import type { DailyReviewState } from './core';

export async function getDailyReviewState(): Promise<Required<DailyReviewState>> {
  const data = await getUserData();
  const state = data.dailyReviewState ?? {};
  return {
    lastReviewedAt: state.lastReviewedAt ?? '',
    dismissedTitles: state.dismissedTitles ?? [],
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
// review. Titles are stored trimmed; adding an existing one is a no-op.
export async function addDismissedReviewTitle(title: string): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) return;
  const data = await getUserData();
  const current = data.dailyReviewState ?? {};
  const dismissed = current.dismissedTitles ?? [];
  if (dismissed.includes(trimmed)) return;
  data.dailyReviewState = { ...current, dismissedTitles: [...dismissed, trimmed] };
  await saveUserData(data);
}
