// Data-level analysis settings: durable attribution rules and the date analysis
// starts from.

import { getUserData, saveUserData } from './core';
import type { EventAttributionRule } from '@/types';

// The app wasn't in use before this date, so earlier weeks are noise: they are
// hidden from Analysis and never reconciled. Stored so it can be moved without a
// code change; this is the seeded default.
export const DEFAULT_ANALYSIS_START_DATE = '2026-07-20';

export async function getAnalysisStartDate(): Promise<string> {
  const data = await getUserData();
  return data.analysisStartDate || DEFAULT_ANALYSIS_START_DATE;
}

export async function setAnalysisStartDate(date: string): Promise<void> {
  const data = await getUserData();
  data.analysisStartDate = date;
  await saveUserData(data);
}

export async function getEventAttributionRules(): Promise<EventAttributionRule[]> {
  const data = await getUserData();
  return data.eventAttributionRules || [];
}

export async function addEventAttributionRule(rule: EventAttributionRule): Promise<void> {
  const data = await getUserData();
  data.eventAttributionRules = [...(data.eventAttributionRules || []), rule];
  await saveUserData(data);
}

export async function removeEventAttributionRule(id: string): Promise<boolean> {
  const data = await getUserData();
  const before = data.eventAttributionRules?.length ?? 0;
  data.eventAttributionRules = (data.eventAttributionRules || []).filter(r => r.id !== id);
  if ((data.eventAttributionRules?.length ?? 0) === before) return false;
  await saveUserData(data);
  return true;
}

// One-off cleanup: drop weekly-stats records for weeks that start before the
// analysis start date. Returns the week keys removed. Idempotent — a second run
// finds nothing to do.
export async function pruneWeeklyStatsBefore(startDate: string): Promise<string[]> {
  const data = await getUserData();
  const all = data.weeklyStats || {};
  const stale = Object.keys(all).filter(weekStart => weekStart < startDate);
  if (stale.length === 0) return [];
  const next = { ...all };
  for (const key of stale) delete next[key];
  data.weeklyStats = next;
  await saveUserData(data);
  return stale;
}
