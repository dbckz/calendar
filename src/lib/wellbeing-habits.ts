// The daily habits tracked in the Wellbeing section.
//
// Held in code rather than storage so the daily-review questions and the
// analysis can never drift apart: the review asks exactly these, and the
// analysis reports exactly these. Adding a habit is an entry here — history for
// it simply starts on the day it appears.
//
// Deliberately free of React imports so API routes, storage and the UI can all
// share it.

import type { HabitDefinition } from '@/types/wellbeing';

export const HABITS: HabitDefinition[] = [
  { id: 'meditate', label: 'Meditate', question: 'Did you meditate today?' },
  { id: 'morning-pages', label: 'Morning pages', question: 'Did you do your morning pages today?' },
];

export function getHabit(id: string): HabitDefinition | undefined {
  return HABITS.find(h => h.id === id);
}

export function isValidHabitId(id: string): boolean {
  return HABITS.some(h => h.id === id);
}

export function habitLabel(id: string): string {
  return getHabit(id)?.label ?? id;
}
