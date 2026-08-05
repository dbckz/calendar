// Period keys for monthly and quarterly goals, and the arithmetic that turns a
// key into a date window / a fraction elapsed.
//
// Keys are strings so they sort lexicographically in the order they occur:
//   month   '2026-08'
//   quarter '2026-Q3'
// A month always sits inside exactly one quarter, which is what lets a monthly
// goal nest under a quarterly one.

import {
  endOfMonth,
  endOfQuarter,
  format,
  parse,
  startOfMonth,
  startOfQuarter,
} from 'date-fns';
import type { GoalPeriodKind } from '@/types/life';

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
const QUARTER_KEY = /^\d{4}-Q[1-4]$/;

export function monthKey(date: Date): string {
  return format(date, 'yyyy-MM');
}

export function quarterKey(date: Date): string {
  return `${format(date, 'yyyy')}-Q${Math.floor(date.getMonth() / 3) + 1}`;
}

export function periodKeyFor(kind: GoalPeriodKind, date: Date): string {
  return kind === 'month' ? monthKey(date) : quarterKey(date);
}

export function isValidPeriodKey(kind: GoalPeriodKind, key: string): boolean {
  return kind === 'month' ? MONTH_KEY.test(key) : QUARTER_KEY.test(key);
}

// Start/end instants of a period key. `end` is the exclusive boundary (the
// first instant of the next period), which keeps elapsed-fraction arithmetic
// free of off-by-a-day errors.
export function periodRange(kind: GoalPeriodKind, key: string): { start: Date; end: Date } {
  if (kind === 'month') {
    const start = startOfMonth(parse(key, 'yyyy-MM', new Date()));
    return { start, end: new Date(endOfMonth(start).getTime() + 1) };
  }
  const [year, q] = key.split('-Q');
  const start = startOfQuarter(new Date(Number(year), (Number(q) - 1) * 3, 1));
  return { start, end: new Date(endOfQuarter(start).getTime() + 1) };
}

// Which quarter contains a month key. Used to find (and validate) the parent of
// a monthly goal.
export function quarterKeyForMonth(key: string): string {
  const { start } = periodRange('month', key);
  return quarterKey(start);
}

// Every month key inside a quarter, in order.
export function monthKeysInQuarter(key: string): string[] {
  const { start } = periodRange('quarter', key);
  return [0, 1, 2].map(offset => monthKey(new Date(start.getFullYear(), start.getMonth() + offset, 1)));
}

// Fraction of the period that has passed, clamped to 0-1. Before the period
// starts this is 0; after it ends, 1.
export function periodElapsed(kind: GoalPeriodKind, key: string, now: Date = new Date()): number {
  const { start, end } = periodRange(kind, key);
  const total = end.getTime() - start.getTime();
  if (total <= 0) return 1;
  const done = (now.getTime() - start.getTime()) / total;
  return Math.min(1, Math.max(0, done));
}

export function isPeriodOver(kind: GoalPeriodKind, key: string, now: Date = new Date()): boolean {
  return now.getTime() >= periodRange(kind, key).end.getTime();
}

export function isCurrentPeriod(kind: GoalPeriodKind, key: string, now: Date = new Date()): boolean {
  return periodKeyFor(kind, now) === key;
}

// 'August 2026' / 'Q3 2026' for headings.
export function periodLabel(kind: GoalPeriodKind, key: string): string {
  if (kind === 'month') return format(periodRange('month', key).start, 'MMMM yyyy');
  const [year, q] = key.split('-Q');
  return `Q${q} ${year}`;
}

// The period key immediately before this one — what a reflection session
// defaults to once a period has ended.
export function previousPeriodKey(kind: GoalPeriodKind, key: string): string {
  const { start } = periodRange(kind, key);
  if (kind === 'month') return monthKey(new Date(start.getFullYear(), start.getMonth() - 1, 1));
  return quarterKey(new Date(start.getFullYear(), start.getMonth() - 3, 1));
}

export function nextPeriodKey(kind: GoalPeriodKind, key: string): string {
  const { start } = periodRange(kind, key);
  if (kind === 'month') return monthKey(new Date(start.getFullYear(), start.getMonth() + 1, 1));
  return quarterKey(new Date(start.getFullYear(), start.getMonth() + 3, 1));
}
