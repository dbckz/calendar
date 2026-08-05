/**
 * @jest-environment node
 *
 * Period keys are the spine of the goals feature: they decide which window a
 * goal is measured over, which quarter a month nests under, and how far through
 * the period pacing thinks we are.
 */
import {
  isValidPeriodKey,
  monthKeysInQuarter,
  nextPeriodKey,
  periodElapsed,
  periodKeyFor,
  periodLabel,
  periodRange,
  previousPeriodKey,
  quarterKeyForMonth,
  isPeriodOver,
} from '@/lib/goal-periods';

describe('period keys', () => {
  it('derives month and quarter keys from a date', () => {
    const d = new Date(2026, 7, 4); // 4 August 2026
    expect(periodKeyFor('month', d)).toBe('2026-08');
    expect(periodKeyFor('quarter', d)).toBe('2026-Q3');
  });

  it('puts each month in the right quarter', () => {
    expect(quarterKeyForMonth('2026-01')).toBe('2026-Q1');
    expect(quarterKeyForMonth('2026-03')).toBe('2026-Q1');
    expect(quarterKeyForMonth('2026-04')).toBe('2026-Q2');
    expect(quarterKeyForMonth('2026-12')).toBe('2026-Q4');
  });

  it('lists a quarter’s months in order', () => {
    expect(monthKeysInQuarter('2026-Q3')).toEqual(['2026-07', '2026-08', '2026-09']);
  });

  it('validates key shapes', () => {
    expect(isValidPeriodKey('month', '2026-08')).toBe(true);
    expect(isValidPeriodKey('month', '2026-13')).toBe(false);
    expect(isValidPeriodKey('month', '2026-Q3')).toBe(false);
    expect(isValidPeriodKey('quarter', '2026-Q3')).toBe(true);
    expect(isValidPeriodKey('quarter', '2026-Q5')).toBe(false);
  });

  it('steps to the previous and next period, crossing year boundaries', () => {
    expect(previousPeriodKey('month', '2026-01')).toBe('2025-12');
    expect(nextPeriodKey('month', '2026-12')).toBe('2027-01');
    expect(previousPeriodKey('quarter', '2026-Q1')).toBe('2025-Q4');
    expect(nextPeriodKey('quarter', '2026-Q4')).toBe('2027-Q1');
  });

  it('labels periods for headings', () => {
    expect(periodLabel('month', '2026-08')).toBe('August 2026');
    expect(periodLabel('quarter', '2026-Q3')).toBe('Q3 2026');
  });
});

describe('periodRange', () => {
  it('spans a whole month, exclusive of the next one', () => {
    const { start, end } = periodRange('month', '2026-08');
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(7);
    expect(start.getDate()).toBe(1);
    // The exclusive end is the first instant of September.
    expect(end.getMonth()).toBe(8);
    expect(end.getDate()).toBe(1);
  });

  it('spans a whole quarter', () => {
    const { start, end } = periodRange('quarter', '2026-Q3');
    expect(start.getMonth()).toBe(6); // July
    expect(end.getMonth()).toBe(9); // October
  });
});

describe('periodElapsed', () => {
  it('is 0 before the period and 1 after it', () => {
    expect(periodElapsed('month', '2026-08', new Date(2026, 6, 1))).toBe(0);
    expect(periodElapsed('month', '2026-08', new Date(2026, 9, 1))).toBe(1);
  });

  it('is about half way through the middle of a 31-day month', () => {
    const elapsed = periodElapsed('month', '2026-08', new Date(2026, 7, 16, 12));
    expect(elapsed).toBeGreaterThan(0.45);
    expect(elapsed).toBeLessThan(0.55);
  });

  it('knows when a period is over', () => {
    expect(isPeriodOver('month', '2026-08', new Date(2026, 7, 20))).toBe(false);
    expect(isPeriodOver('month', '2026-08', new Date(2026, 8, 1))).toBe(true);
  });
});
