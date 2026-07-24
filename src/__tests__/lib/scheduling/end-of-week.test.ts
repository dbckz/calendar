/**
 * Boundaries of end-of-week detection: the review swaps to carry-over mode on
 * the last working day of the week and stays there for the weekend.
 */
import { isEndOfWeekReview } from '@/lib/scheduling/end-of-week';

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
