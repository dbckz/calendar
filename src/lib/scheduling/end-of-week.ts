// End-of-week detection for the daily review.
//
// On the last working day of the week (and the weekend after it) there is no
// remaining week to reschedule into, so the review swaps its "reschedule /
// defer / prioritise tomorrow" options for a single carry-over decision per
// task. Weeks start on Monday, matching every other scheduling path.

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
