import {
  formatDuration,
  formatTimeRange,
  getDayLabel,
  plainDescription,
  sourceLabel,
} from '@/lib/event-display';
import { createMockCalendarEvent } from '../mocks/data';

describe('formatDuration', () => {
  it('formats sub-hour durations in minutes', () => {
    expect(formatDuration(59)).toBe('59m');
  });

  it('formats exact hours without minutes', () => {
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(120)).toBe('2h');
  });

  it('formats mixed hours and minutes', () => {
    expect(formatDuration(90)).toBe('1h 30m');
  });
});

describe('formatTimeRange', () => {
  it('labels all-day events', () => {
    const event = createMockCalendarEvent({ allDay: true });
    expect(formatTimeRange(event)).toBe('All day');
  });

  it('formats timed events as a range', () => {
    const event = createMockCalendarEvent({
      startTime: new Date('2024-01-15T09:00:00'),
      endTime: new Date('2024-01-15T10:30:00'),
    });
    expect(formatTimeRange(event)).toBe('9:00 AM - 10:30 AM');
  });
});

describe('plainDescription', () => {
  it('returns empty string for undefined', () => {
    expect(plainDescription(undefined)).toBe('');
  });

  it('collapses whitespace in plain text', () => {
    expect(plainDescription('  hello\n  world  ')).toBe('hello world');
  });

  it('strips HTML markup', () => {
    const result = plainDescription('<p>hello <strong>world</strong></p>');
    expect(result).toContain('hello');
    expect(result).toContain('world');
    expect(result).not.toContain('<p>');
  });
});

describe('getDayLabel', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2024-01-15T12:00:00'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('labels today', () => {
    expect(getDayLabel(new Date('2024-01-15T08:00:00'))).toBe('Today');
  });

  it('labels yesterday', () => {
    expect(getDayLabel(new Date('2024-01-14T08:00:00'))).toBe('Yesterday');
  });

  it('labels tomorrow', () => {
    expect(getDayLabel(new Date('2024-01-16T08:00:00'))).toBe('Tomorrow');
  });

  it('formats other dates', () => {
    expect(getDayLabel(new Date('2024-01-20T08:00:00'))).toBe('Sat, Jan 20');
  });
});

describe('sourceLabel', () => {
  it('prefers the integration name', () => {
    const event = createMockCalendarEvent({ integrationName: 'OM', calendarName: 'Cal' });
    expect(sourceLabel(event)).toBe('OM');
  });

  it('falls back to the calendar name, then the source label', () => {
    expect(sourceLabel(createMockCalendarEvent({ integrationName: undefined, calendarName: 'Cal' }))).toBe('Cal');
    expect(sourceLabel(createMockCalendarEvent({ integrationName: undefined, calendarName: undefined, source: 'adhoc' }))).toBe('Task');
  });
});
