/**
 * Boundaries of end-of-week detection: the review swaps to carry-over mode on
 * the last working day of the week and stays there for the weekend.
 */
import { isEndOfWeekReview, countMissedWorkingDays } from '@/lib/scheduling/end-of-week';

// Week of Monday 2026-07-13.
const MON = new Date(2026, 6, 13, 12, 0, 0);
const THU = new Date(2026, 6, 16, 18, 0, 0);
const FRI = new Date(2026, 6, 17, 9, 0, 0);
const SAT = new Date(2026, 6, 18, 12, 0, 0);
const SUN = new Date(2026, 6, 19, 23, 0, 0);

describe('isEndOfWeekReview', () => {
  it('is false Monday to Thursday of a Mon–Fri week', () => {
    expect(isEndOfWeekReview(MON)).toBe(false);
    expect(isEndOfWeekReview(new Date(2026, 6, 15, 8, 0, 0))).toBe(false);
    expect(isEndOfWeekReview(THU)).toBe(false);
  });

  it('is true from Friday onwards, including the weekend', () => {
    expect(isEndOfWeekReview(FRI)).toBe(true);
    expect(isEndOfWeekReview(SAT)).toBe(true);
    expect(isEndOfWeekReview(SUN)).toBe(true);
  });

  it('honours a shorter configured working week', () => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday'];
    expect(isEndOfWeekReview(new Date(2026, 6, 15, 8, 0, 0), days)).toBe(false); // Wed
    expect(isEndOfWeekReview(THU, days)).toBe(true);
    expect(isEndOfWeekReview(FRI, days)).toBe(true);
  });

  it('honours a working week that runs into the weekend', () => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    expect(isEndOfWeekReview(FRI, days)).toBe(false);
    expect(isEndOfWeekReview(SAT, days)).toBe(true);
    expect(isEndOfWeekReview(SUN, days)).toBe(true);
  });

  it('falls back to Mon–Fri when the configured days are empty or unrecognised', () => {
    expect(isEndOfWeekReview(FRI, [])).toBe(true);
    expect(isEndOfWeekReview(THU, [])).toBe(false);
    expect(isEndOfWeekReview(FRI, ['Notaday'])).toBe(false);
  });
});

describe('countMissedWorkingDays', () => {
  // Both endpoints excluded: the window-start day was already reviewed and today
  // is the review being done now.
  const d = (y: number, m: number, day: number, h = 0) => new Date(y, m, day, h, 0, 0);

  it('counts nothing for a Friday-evening review picked up on Monday (weekend skipped)', () => {
    // Window start Fri 2026-07-17, today Mon 2026-07-20. Between: Sat + Sun only.
    expect(countMissedWorkingDays(d(2026, 6, 17, 18), d(2026, 6, 20, 9))).toBe(0);
  });

  it('counts the working days strictly between the two dates', () => {
    // Reviewed Mon 2026-07-13, now Thu 2026-07-16. Between: Tue + Wed → 2.
    expect(countMissedWorkingDays(d(2026, 6, 13), d(2026, 6, 16))).toBe(2);
  });

  it('excludes both endpoints — same day is zero, adjacent days are zero', () => {
    expect(countMissedWorkingDays(d(2026, 6, 15), d(2026, 6, 15))).toBe(0);
    // Tue → Wed: nothing strictly between.
    expect(countMissedWorkingDays(d(2026, 6, 14), d(2026, 6, 15))).toBe(0);
  });

  it('honours a custom working week (Sat counts, Fri does not)', () => {
    const days = ['Saturday', 'Sunday'];
    // Wed 2026-07-15 → Mon 2026-07-20. Between: Thu, Fri, Sat, Sun → only Sat+Sun.
    expect(countMissedWorkingDays(d(2026, 6, 15), d(2026, 6, 20), days)).toBe(2);
  });

  it('excludes out-of-office days from the count', () => {
    // Reviewed Mon 2026-07-13, now Fri 2026-07-17. Between working days: Tue, Wed,
    // Thu. Wednesday is OOO → 2 counted.
    const ooo = new Set(['2026-07-15']);
    expect(countMissedWorkingDays(d(2026, 6, 13), d(2026, 6, 17), undefined, ooo)).toBe(2);
  });

  it('normalises endpoints to their calendar date (rollover-hour time never leaks a day)', () => {
    // Today is Mon at 03:00 (before a 04:00 rollover, still "Monday"); window start
    // Fri 18:00. Between: Sat + Sun → 0, and the sub-rollover Monday time must not
    // pull Monday itself into the count.
    expect(countMissedWorkingDays(d(2026, 6, 17, 18), d(2026, 6, 20, 3))).toBe(0);
  });
});
