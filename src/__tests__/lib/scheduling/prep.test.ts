/**
 * Tests for the pure meeting-prep block placer.
 * Dates use the local Date constructor so tests are timezone-independent.
 */
import { proposePrepBlocks, type PrepMeeting } from '@/lib/scheduling/prep';
import type { BusyInterval } from '@/lib/scheduling/types';
import type { WorkflowConfig } from '@/lib/workflow-config-storage';

const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEK_START = new Date(2026, 6, 13, 0, 0, 0, 0); // Monday 2026-07-13

function makeConfig(overrides: Partial<WorkflowConfig['scheduling']> = {}): WorkflowConfig {
  return {
    taskQuotas: {},
    typeMapping: {},
    scheduling: {
      maxTasksPerDay: 4,
      bufferBetweenTasks: '30min',
      workingDays: ALL_DAYS,
      workingHours: { start: '09:00', end: '17:00' },
      ...overrides,
    },
    lastUpdated: '2026-07-12T00:00:00.000Z',
  };
}

function meeting(overrides: Partial<PrepMeeting> & { startMs: number }): PrepMeeting {
  const d = new Date(overrides.startMs);
  return {
    eventId: 'evt-1',
    title: 'Board sync',
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    ...overrides,
  };
}

function run(input: {
  meetings: PrepMeeting[];
  scheduling?: Partial<WorkflowConfig['scheduling']>;
  busyIntervals?: BusyInterval[];
  existingBlocksByDate?: Record<string, number>;
}) {
  return proposePrepBlocks({
    meetings: input.meetings,
    config: makeConfig(input.scheduling),
    busyIntervals: input.busyIntervals ?? [],
    existingBlocksByDate: input.existingBlocksByDate ?? {},
    weekStart: WEEK_START,
    now: WEEK_START,
  });
}

describe('proposePrepBlocks', () => {
  it('books prep the day before a mid-week meeting in working hours', () => {
    const startMs = new Date(2026, 6, 15, 14, 0).getTime(); // Wed 14:00
    const { placed, unplaced } = run({ meetings: [meeting({ startMs })] });

    expect(unplaced).toHaveLength(0);
    expect(placed).toHaveLength(1);
    const block = placed[0];
    expect(block.kind).toBe('prep');
    expect(block.category).toBe('Meeting prep');
    expect(block.durationMinutes).toBe(30);
    expect(block.date).toBe('2026-07-14'); // Tuesday, the day before
    expect(block.start).toBe('09:00');
    expect(block.meeting?.eventId).toBe('evt-1');
    expect(block.reason).toContain('Board sync');
    expect(block.reason).toContain('Wed 14:00');
  });

  it('falls back to the day of when the day before is not a working day in the week', () => {
    // Monday meeting: the day before (Sunday) sits outside this week's days.
    const startMs = new Date(2026, 6, 13, 14, 0).getTime(); // Mon 14:00
    const { placed, unplaced } = run({ meetings: [meeting({ startMs })] });

    expect(unplaced).toHaveLength(0);
    expect(placed).toHaveLength(1);
    expect(placed[0].date).toBe('2026-07-13'); // Monday, day of
    expect(placed[0].start).toBe('09:00'); // before the 14:00 meeting
  });

  it('respects the buffer before the meeting on the day-of fallback', () => {
    // Monday meeting at 09:45: day-of window is [09:00, 09:15] (buffer 30m),
    // too short for a 30-min prep -> unplaced.
    const startMs = new Date(2026, 6, 13, 9, 45).getTime();
    const { placed, unplaced } = run({ meetings: [meeting({ startMs })] });

    expect(placed).toHaveLength(0);
    expect(unplaced).toHaveLength(1);
    expect(unplaced[0].eventId).toBe('evt-1');
  });

  it('reports meetings that fit nowhere as unplaced', () => {
    // Monday meeting at 09:00: no prior working day, and no room before it.
    const startMs = new Date(2026, 6, 13, 9, 0).getTime();
    const { placed, unplaced } = run({ meetings: [meeting({ startMs })] });

    expect(placed).toHaveLength(0);
    expect(unplaced).toHaveLength(1);
  });

  it('places two meetings\' preps without collision', () => {
    const m1 = meeting({ eventId: 'a', title: 'One', startMs: new Date(2026, 6, 15, 14, 0).getTime() });
    const m2 = meeting({ eventId: 'b', title: 'Two', startMs: new Date(2026, 6, 15, 15, 0).getTime() });
    const { placed, unplaced } = run({ meetings: [m1, m2] });

    expect(unplaced).toHaveLength(0);
    expect(placed).toHaveLength(2);
    // Both prep on Tuesday, at distinct non-overlapping times.
    expect(placed.every(p => p.date === '2026-07-14')).toBe(true);
    const starts = placed.map(p => p.start).sort();
    expect(new Set(starts).size).toBe(2);
  });

  it('honours maxTasksPerDay when placing prep', () => {
    // Tuesday already full (maxTasksPerDay 1) -> day-before blocked, so prep for
    // a Wednesday meeting falls back to the day of.
    const startMs = new Date(2026, 6, 15, 14, 0).getTime(); // Wed 14:00
    const { placed, unplaced } = run({
      meetings: [meeting({ startMs })],
      scheduling: { maxTasksPerDay: 1 },
      existingBlocksByDate: { '2026-07-14': 1 }, // Tuesday full
    });

    expect(unplaced).toHaveLength(0);
    expect(placed).toHaveLength(1);
    expect(placed[0].date).toBe('2026-07-15'); // Wednesday, day of
  });
});
