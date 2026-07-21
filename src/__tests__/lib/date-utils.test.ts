/**
 * Tests for the shared day-rollover date helpers.
 * Dates use the local Date constructor so the tests are timezone-independent:
 * the local time we build and the local date we assert on always agree.
 */
import {
  DEFAULT_ROLLOVER_HOUR,
  normalizeRolloverHour,
  formatLocalDate,
  logicalToday,
  logicalTodayDate,
} from '@/lib/date-utils';

describe('formatLocalDate', () => {
  it('formats a local date as YYYY-MM-DD (never shifts to UTC)', () => {
    // Just after midnight local — a UTC-based formatter could report the prior
    // day here; formatLocalDate must not.
    expect(formatLocalDate(new Date(2026, 6, 22, 0, 6, 0))).toBe('2026-07-22');
    expect(formatLocalDate(new Date(2026, 0, 1, 23, 59, 0))).toBe('2026-01-01');
  });
});

describe('normalizeRolloverHour', () => {
  it('accepts valid integer hours 0–23', () => {
    expect(normalizeRolloverHour(0)).toBe(0);
    expect(normalizeRolloverHour(4)).toBe(4);
    expect(normalizeRolloverHour(23)).toBe(23);
  });

  it('falls back to the default for absent or malformed values', () => {
    expect(normalizeRolloverHour(undefined)).toBe(DEFAULT_ROLLOVER_HOUR);
    expect(normalizeRolloverHour(null)).toBe(DEFAULT_ROLLOVER_HOUR);
    expect(normalizeRolloverHour(24)).toBe(DEFAULT_ROLLOVER_HOUR);
    expect(normalizeRolloverHour(-1)).toBe(DEFAULT_ROLLOVER_HOUR);
    expect(normalizeRolloverHour(3.5)).toBe(DEFAULT_ROLLOVER_HOUR);
    expect(normalizeRolloverHour('nope')).toBe(DEFAULT_ROLLOVER_HOUR);
  });
});

describe('logicalToday with the default 04:00 rollover', () => {
  // All four boundary cases fall on 2026-07-22; before the rollover they belong
  // to the previous day (2026-07-21), at/after it they belong to the same day.
  it('23:59 the previous evening counts as that day', () => {
    expect(logicalToday(new Date(2026, 6, 21, 23, 59))).toBe('2026-07-21');
  });

  it('00:30 (before rollover) still counts as the previous day', () => {
    expect(logicalToday(new Date(2026, 6, 22, 0, 30))).toBe('2026-07-21');
  });

  it('03:59 (just before rollover) still counts as the previous day', () => {
    expect(logicalToday(new Date(2026, 6, 22, 3, 59))).toBe('2026-07-21');
  });

  it('04:00 (at rollover) flips to the new day', () => {
    expect(logicalToday(new Date(2026, 6, 22, 4, 0))).toBe('2026-07-22');
  });

  it('midday counts as the current day', () => {
    expect(logicalToday(new Date(2026, 6, 22, 12, 0))).toBe('2026-07-22');
  });
});

describe('logicalToday across month and year boundaries', () => {
  it('00:30 on the 1st rolls back to the last day of the previous month', () => {
    expect(logicalToday(new Date(2026, 7, 1, 0, 30))).toBe('2026-07-31');
  });

  it('00:30 on Jan 1 rolls back to Dec 31 of the previous year', () => {
    expect(logicalToday(new Date(2026, 0, 1, 0, 30))).toBe('2025-12-31');
  });
});

describe('logicalToday honours a custom rollover hour', () => {
  it('a 0 rollover disables the shift (midnight is already the new day)', () => {
    expect(logicalToday(new Date(2026, 6, 22, 0, 30), 0)).toBe('2026-07-22');
  });

  it('a 6 rollover keeps 05:00 on the previous day', () => {
    expect(logicalToday(new Date(2026, 6, 22, 5, 0), 6)).toBe('2026-07-21');
    expect(logicalToday(new Date(2026, 6, 22, 6, 0), 6)).toBe('2026-07-22');
  });
});

describe('logicalTodayDate', () => {
  it('returns a local-midnight Date for the logical day', () => {
    const d = logicalTodayDate(new Date(2026, 6, 22, 0, 30));
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(21);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it('is DST-agnostic: works purely on local calendar fields', () => {
    // 2026-03-08 is a US spring-forward date; 2026-10-25 is EU fall-back.
    // Regardless of any transition, a 12:00 local time maps to that calendar day.
    expect(logicalToday(new Date(2026, 2, 8, 12, 0))).toBe('2026-03-08');
    expect(logicalToday(new Date(2026, 9, 25, 12, 0))).toBe('2026-10-25');
  });
});
