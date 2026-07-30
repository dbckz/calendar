// End-of-week detection for the daily review.
//
// On the last working day of the week (and the weekend after it) there is no
// remaining week to reschedule into, so the review swaps its "reschedule /
// defer / prioritise tomorrow" options for a single carry-over decision per
// task. Weeks start on Monday, matching every other scheduling path.

import { formatLocalDate } from '@/lib/date-utils';

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const DEFAULT_WORKING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

// Monday = 0 … Sunday = 6, so "later in the week" is a simple comparison.
function mondayIndex(dayName: string): number {
  const i = WEEKDAY_NAMES.findIndex(n => n.toLowerCase() === dayName.trim().toLowerCase());
  return i < 0 ? -1 : (i + 6) % 7;
}

// True when `now` falls on the last configured working day of the week or later
// (i.e. Friday, Saturday or Sunday for a Mon–Fri week). Callers that honour a
// day-rollover hour should pass the LOGICAL today rather than the raw clock, so
// Friday 01:00 with a 04:00 rollover still counts as Thursday.
export function isEndOfWeekReview(now: Date, workingDays?: string[]): boolean {
  const names = workingDays?.length ? workingDays : DEFAULT_WORKING_DAYS;
  const indices = names.map(mondayIndex).filter(i => i >= 0);
  if (indices.length === 0) return false;
  const lastWorkingDay = Math.max(...indices);
  return (now.getDay() + 6) % 7 >= lastWorkingDay;
}

// True when `now` falls on one of the configured working days (default Mon–Fri).
// Callers honouring a day-rollover hour should pass the LOGICAL today, so the
// small hours before rollover still count as the previous day.
export function isWorkingDay(now: Date, workingDays?: string[]): boolean {
  const names = workingDays?.length ? workingDays : DEFAULT_WORKING_DAYS;
  const today = WEEKDAY_NAMES[now.getDay()].toLowerCase();
  return names.some(n => n.trim().toLowerCase() === today);
}

// How many CONFIGURED WORKING days were missed between the last review and today:
// the days D STRICTLY between `fromDate` (the review window's start) and `toDate`
// (today) that are a working day AND not out of office. Both endpoints are
// excluded — the window-start day was reviewed, and today is the review being
// done now — so a Friday-evening review picked up on Monday counts 0 (only the
// weekend lies between, and neither weekend day is a working day). Endpoints are
// normalised to their local calendar date so a rollover-hour time on either side
// never bleeds an extra day in. `outOfOffice` is a set of yyyy-MM-dd; it only
// covers days the caller could resolve (in practice the current week), so
// prior-week days simply aren't excludable — acceptable, we don't fetch more.
export function countMissedWorkingDays(
  fromDate: Date,
  toDate: Date,
  workingDays?: string[],
  outOfOffice?: ReadonlySet<string>
): number {
  const to = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
  // Starts the day strictly after the window-start day.
  const d = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + 1);
  let count = 0;
  while (d < to) {
    if (isWorkingDay(d, workingDays) && !outOfOffice?.has(formatLocalDate(d))) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}
