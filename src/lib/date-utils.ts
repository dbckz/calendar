// Shared, I/O-free date helpers for the app's notion of "today".
//
// The planner is used late at night — often past midnight — so the calendar
// day shouldn't flip to the next date the instant the clock passes 00:00 while
// the current day's plan is still in flight. A configurable "day rollover hour"
// (default 04:00) means local times before that hour still count as the
// previous day. This module is the single source of truth for that logic, used
// by both client components and server routes so they always agree.

export const DEFAULT_ROLLOVER_HOUR = 4;

// Coerce an untrusted rollover-hour value to a valid integer hour (0–23),
// falling back to the default when absent or malformed.
export function normalizeRolloverHour(raw: unknown): number {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 23) {
    return raw;
  }
  return DEFAULT_ROLLOVER_HOUR;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// Format a Date as a LOCAL calendar date (YYYY-MM-DD). Unlike
// `toISOString().split('T')[0]`, this never shifts the date into UTC, so it
// stays correct either side of midnight in any timezone.
export function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// The app's logical "today" as a local Date at midnight, honouring the rollover
// hour: local times before `rolloverHour` resolve to the previous calendar day.
// Operates purely on local calendar fields, so it's DST-agnostic.
export function logicalTodayDate(
  now: Date = new Date(),
  rolloverHour: number = DEFAULT_ROLLOVER_HOUR
): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  if (now.getHours() < rolloverHour) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

// The app's logical "today" as a local YYYY-MM-DD string.
export function logicalToday(
  now: Date = new Date(),
  rolloverHour: number = DEFAULT_ROLLOVER_HOUR
): string {
  return formatLocalDate(logicalTodayDate(now, rolloverHour));
}
