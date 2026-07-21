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
}) {
  return proposePrepBlocks({
    meetings: input.meetings,
    config: makeConfig(input.scheduling),
    busyIntervals: input.busyIntervals ?? [],
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
    expect(block.durationMinutes).toBe(15);
    expect(block.date).toBe('2026-07-14'); // Tuesday, the day before
    expect(block.start).toBe('12:00'); // afternoon-first, mornings left for deep work
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
    expect(placed[0].start).toBe('12:00'); // afternoon-first, before the 14:00 meeting
  });

  it('fits a day-of prep before the meeting start (capped at the meeting, no flat buffer)', () => {
    // Monday meeting at 09:40: day-of window is [09:00, 09:40]. A 15-min prep fits
    // at 09:00 and ends before the meeting starts (the work-run rule governs runs,
    // not a flat pre-meeting buffer).
    const startMs = new Date(2026, 6, 13, 9, 40).getTime();
    const { placed, unplaced } = run({ meetings: [meeting({ startMs })] });

    expect(unplaced).toHaveLength(0);
    expect(placed).toHaveLength(1);
    expect(placed[0].date).toBe('2026-07-13');
    expect(placed[0].start).toBe('09:00');
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

  it('prefers the afternoon on the day before, but still fits a morning meeting day-of when the day before is full', () => {
    // Meeting Tuesday 10:00. Monday (day before) is busy across all working
    // hours, so no prep slot exists there. Day-of Tuesday morning must still
    // fit prep before the 10:00 meeting (afternoon window is empty when capped
    // before noon, so it falls through to the morning working-hours window).
    const startMs = new Date(2026, 6, 14, 10, 0).getTime(); // Tue 10:00
    const mondayFull: BusyInterval = {
      start: new Date(2026, 6, 13, 9, 0),
      end: new Date(2026, 6, 13, 17, 0),
    };
    const { placed, unplaced } = run({
      meetings: [meeting({ startMs })],
      busyIntervals: [mondayFull],
    });

    expect(unplaced).toHaveLength(0);
    expect(placed).toHaveLength(1);
    expect(placed[0].date).toBe('2026-07-14'); // Tuesday, day of
    expect(placed[0].start).toBe('09:00'); // morning, before the 10:00 meeting
  });

  it('defaults a prep block to 15 minutes when the meeting has no durationMinutes', () => {
    const startMs = new Date(2026, 6, 15, 14, 0).getTime(); // Wed 14:00
    const { placed } = run({ meetings: [meeting({ startMs })] });
    expect(placed).toHaveLength(1);
    expect(placed[0].durationMinutes).toBe(15);
  });

  it('applies each meeting\'s own durationMinutes, defaulting the rest to 15', () => {
    // Two meetings the day before: one overrides to 30, the other has no
    // override → 15. Each placed block carries its own meeting's length.
    const overridden = meeting({
      eventId: 'a',
      title: 'Override',
      startMs: new Date(2026, 6, 15, 14, 0).getTime(),
      durationMinutes: 30,
    });
    const defaulted = meeting({
      eventId: 'b',
      title: 'Default',
      startMs: new Date(2026, 6, 15, 15, 0).getTime(),
    });
    const { placed, unplaced } = run({ meetings: [overridden, defaulted] });

    expect(unplaced).toHaveLength(0);
    expect(placed).toHaveLength(2);
    const byEvent = new Map(placed.map(p => [p.meeting!.eventId, p]));
    expect(byEvent.get('a')!.durationMinutes).toBe(30);
    expect(byEvent.get('b')!.durationMinutes).toBe(15);
  });

  it('honours a per-meeting durationMinutes of 60', () => {
    const startMs = new Date(2026, 6, 15, 14, 0).getTime(); // Wed 14:00
    const { placed } = run({ meetings: [meeting({ startMs, durationMinutes: 60 })] });
    expect(placed).toHaveLength(1);
    expect(placed[0].durationMinutes).toBe(60);
  });

  it('honours a preferredDate several days before the meeting', () => {
    // Friday meeting; user picks Monday (three days before) for the prep.
    const startMs = new Date(2026, 6, 17, 14, 0).getTime(); // Fri 14:00
    const { placed, unplaced } = run({
      meetings: [meeting({ startMs, preferredDate: '2026-07-13' })],
    });
    expect(unplaced).toHaveLength(0);
    expect(placed).toHaveLength(1);
    expect(placed[0].date).toBe('2026-07-13'); // Monday, the chosen day
  });

  it('respects the before-meeting end-cap when preferredDate is the meeting day', () => {
    // Monday meeting at 09:40, prep preferred on the day of. The day-of window is
    // [09:00, 09:40]; a 15-min prep must fit before the meeting starts.
    const startMs = new Date(2026, 6, 13, 9, 40).getTime(); // Mon 09:40
    const { placed, unplaced } = run({
      meetings: [meeting({ startMs, preferredDate: '2026-07-13' })],
    });
    expect(unplaced).toHaveLength(0);
    expect(placed).toHaveLength(1);
    expect(placed[0].date).toBe('2026-07-13');
    expect(placed[0].start).toBe('09:00'); // before the 09:40 meeting
  });

  it('falls back to the default search when the preferred day is full', () => {
    // Wednesday meeting; user prefers Monday, but Monday is fully busy. Placement
    // falls back to the default day-before (Tuesday) search so prep isn't lost.
    const startMs = new Date(2026, 6, 15, 14, 0).getTime(); // Wed 14:00
    const mondayFull: BusyInterval = {
      start: new Date(2026, 6, 13, 9, 0),
      end: new Date(2026, 6, 13, 17, 0),
    };
    const { placed, unplaced } = run({
      meetings: [meeting({ startMs, preferredDate: '2026-07-13' })],
      busyIntervals: [mondayFull],
    });
    expect(unplaced).toHaveLength(0);
    expect(placed).toHaveLength(1);
    expect(placed[0].date).toBe('2026-07-14'); // Tuesday, the default day-before
  });

});
