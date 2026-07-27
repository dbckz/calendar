/**
 * Tests for the free-busy conversion used by the "Plan my week" scheduler.
 */
import { eventsToBusyIntervals, mergeIntervals, outOfOfficeDates } from '@/lib/scheduling/free-busy';

const d = (iso: string) => new Date(iso);

describe('mergeIntervals', () => {
  it('sorts and leaves disjoint intervals untouched', () => {
    const merged = mergeIntervals([
      { start: d('2026-07-13T14:00:00'), end: d('2026-07-13T15:00:00') },
      { start: d('2026-07-13T09:00:00'), end: d('2026-07-13T10:00:00') },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].start).toEqual(d('2026-07-13T09:00:00'));
    expect(merged[1].start).toEqual(d('2026-07-13T14:00:00'));
  });

  it('merges overlapping intervals', () => {
    const merged = mergeIntervals([
      { start: d('2026-07-13T09:00:00'), end: d('2026-07-13T10:30:00') },
      { start: d('2026-07-13T10:00:00'), end: d('2026-07-13T11:00:00') },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].end).toEqual(d('2026-07-13T11:00:00'));
  });

  it('merges adjacent (touching) intervals', () => {
    const merged = mergeIntervals([
      { start: d('2026-07-13T09:00:00'), end: d('2026-07-13T10:00:00') },
      { start: d('2026-07-13T10:00:00'), end: d('2026-07-13T11:00:00') },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].start).toEqual(d('2026-07-13T09:00:00'));
    expect(merged[0].end).toEqual(d('2026-07-13T11:00:00'));
  });

  it('drops zero-length / inverted intervals', () => {
    const merged = mergeIntervals([
      { start: d('2026-07-13T09:00:00'), end: d('2026-07-13T09:00:00') },
      { start: d('2026-07-13T11:00:00'), end: d('2026-07-13T10:00:00') },
    ]);
    expect(merged).toHaveLength(0);
  });

  it('keeps a shorter interval fully contained in a longer one merged', () => {
    const merged = mergeIntervals([
      { start: d('2026-07-13T09:00:00'), end: d('2026-07-13T12:00:00') },
      { start: d('2026-07-13T10:00:00'), end: d('2026-07-13T10:30:00') },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].end).toEqual(d('2026-07-13T12:00:00'));
  });
});

describe('eventsToBusyIntervals', () => {
  it('excludes all-day events', () => {
    const busy = eventsToBusyIntervals([
      { startTime: d('2026-07-13T00:00:00'), endTime: d('2026-07-14T00:00:00'), allDay: true },
      { startTime: d('2026-07-13T09:00:00'), endTime: d('2026-07-13T10:00:00') },
    ]);
    expect(busy).toHaveLength(1);
    expect(busy[0].start).toEqual(d('2026-07-13T09:00:00'));
  });

  it('accepts ISO string times', () => {
    const busy = eventsToBusyIntervals([
      { startTime: '2026-07-13T09:00:00', endTime: '2026-07-13T10:00:00' },
    ]);
    expect(busy).toHaveLength(1);
  });

  it('skips invalid and zero-length events', () => {
    const busy = eventsToBusyIntervals([
      { startTime: 'not-a-date', endTime: 'nope' },
      { startTime: d('2026-07-13T09:00:00'), endTime: d('2026-07-13T09:00:00') },
    ]);
    expect(busy).toHaveLength(0);
  });

  it('excludes declined events but keeps accepted / needsAction / tentative / unset', () => {
    const busy = eventsToBusyIntervals([
      { startTime: d('2026-07-13T09:00:00'), endTime: d('2026-07-13T10:00:00'), selfResponseStatus: 'declined' },
      { startTime: d('2026-07-13T11:00:00'), endTime: d('2026-07-13T12:00:00'), selfResponseStatus: 'accepted' },
      { startTime: d('2026-07-13T13:00:00'), endTime: d('2026-07-13T14:00:00'), selfResponseStatus: 'needsAction' },
      { startTime: d('2026-07-13T15:00:00'), endTime: d('2026-07-13T16:00:00'), selfResponseStatus: 'tentative' },
      { startTime: d('2026-07-13T16:30:00'), endTime: d('2026-07-13T17:00:00') },
    ]);
    expect(busy).toHaveLength(4);
    expect(
      busy.some(b => b.start.getTime() === d('2026-07-13T09:00:00').getTime())
    ).toBe(false);
  });

  it('merges overlapping timed events across the list', () => {
    const busy = eventsToBusyIntervals([
      { startTime: d('2026-07-13T09:00:00'), endTime: d('2026-07-13T10:00:00') },
      { startTime: d('2026-07-13T09:30:00'), endTime: d('2026-07-13T11:00:00') },
    ]);
    expect(busy).toHaveLength(1);
    expect(busy[0].end).toEqual(d('2026-07-13T11:00:00'));
  });

  it('tags a lunch-ritual event as a break and keeps it separate from an adjacent meeting', () => {
    const busy = eventsToBusyIntervals([
      { title: '🍽️ Lunch', startTime: d('2026-07-13T12:00:00'), endTime: d('2026-07-13T12:30:00') },
      { title: 'Standup', startTime: d('2026-07-13T12:30:00'), endTime: d('2026-07-13T13:00:00') },
    ]);
    // The break is NOT merged into the touching meeting: two intervals remain.
    expect(busy).toHaveLength(2);
    const lunch = busy.find(b => b.start.getTime() === d('2026-07-13T12:00:00').getTime());
    const meeting = busy.find(b => b.start.getTime() === d('2026-07-13T12:30:00').getTime());
    expect(lunch?.isBreak).toBe(true);
    expect(meeting?.isBreak).toBeFalsy();
  });

  it('tags an exercise-ritual event as a break and keeps it separate from an adjacent meeting', () => {
    const busy = eventsToBusyIntervals([
      { title: '🏋️ Exercise', startTime: d('2026-07-13T15:00:00'), endTime: d('2026-07-13T16:00:00') },
      { title: 'Review', startTime: d('2026-07-13T16:00:00'), endTime: d('2026-07-13T16:30:00') },
    ]);
    // The break is NOT merged into the touching meeting: two intervals remain,
    // so a work run interrupted by exercise stays split into two runs.
    expect(busy).toHaveLength(2);
    const exercise = busy.find(b => b.start.getTime() === d('2026-07-13T15:00:00').getTime());
    const meeting = busy.find(b => b.start.getTime() === d('2026-07-13T16:00:00').getTime());
    expect(exercise?.isBreak).toBe(true);
    expect(meeting?.isBreak).toBeFalsy();
  });

  it('treats an emails-ritual event as ordinary work (not a break)', () => {
    const busy = eventsToBusyIntervals([
      { title: '📧 Emails', startTime: d('2026-07-13T16:00:00'), endTime: d('2026-07-13T16:30:00') },
    ]);
    expect(busy).toHaveLength(1);
    expect(busy[0].isBreak).toBeFalsy();
  });

  it('tags a "☕ Break" event as a break so work runs stay split around it', () => {
    const busy = eventsToBusyIntervals([
      { title: 'Focus', startTime: d('2026-07-13T09:00:00'), endTime: d('2026-07-13T11:00:00') },
      { title: '☕ Break', startTime: d('2026-07-13T11:00:00'), endTime: d('2026-07-13T11:15:00') },
      { title: 'Focus 2', startTime: d('2026-07-13T11:15:00'), endTime: d('2026-07-13T13:00:00') },
    ]);
    const brk = busy.find(b => b.start.getTime() === d('2026-07-13T11:00:00').getTime());
    expect(brk?.isBreak).toBe(true);
  });

  describe('transparency (free/busy)', () => {
    it('skips a transparent (marked-free) external event', () => {
      const busy = eventsToBusyIntervals([
        { title: 'Optional webinar', startTime: d('2026-07-13T09:00:00'), endTime: d('2026-07-13T10:00:00'), transparency: 'transparent' },
        { title: 'Real meeting', startTime: d('2026-07-13T11:00:00'), endTime: d('2026-07-13T12:00:00'), transparency: 'opaque' },
      ]);
      expect(busy).toHaveLength(1);
      expect(busy[0].start).toEqual(d('2026-07-13T11:00:00'));
    });

    it('keeps an opaque event and one with no transparency set (defaults to busy)', () => {
      const busy = eventsToBusyIntervals([
        { title: 'Opaque', startTime: d('2026-07-13T09:00:00'), endTime: d('2026-07-13T10:00:00'), transparency: 'opaque' },
        { title: 'Unset', startTime: d('2026-07-13T11:00:00'), endTime: d('2026-07-13T12:00:00') },
      ]);
      expect(busy).toHaveLength(2);
    });

    it('keeps a transparent APP-CREATED block busy when its id is in appEventIds', () => {
      const busy = eventsToBusyIntervals(
        [
          { id: 'evt-123', title: 'anything', startTime: d('2026-07-13T09:00:00'), endTime: d('2026-07-13T10:00:00'), transparency: 'transparent' },
        ],
        new Set(['evt-123'])
      );
      expect(busy).toHaveLength(1);
    });

    it('keeps a transparent APP-CREATED block busy by title convention (ritual / prep / category emoji)', () => {
      const busy = eventsToBusyIntervals([
        // Ritual title.
        { title: '📧 Emails', startTime: d('2026-07-13T09:00:00'), endTime: d('2026-07-13T09:30:00'), transparency: 'transparent' },
        // Prep title.
        { title: '📖 Prep: Board call', startTime: d('2026-07-13T10:00:00'), endTime: d('2026-07-13T10:15:00'), transparency: 'transparent' },
        // Category-emoji task block.
        { title: '✍️ Draft the essay', startTime: d('2026-07-13T11:00:00'), endTime: d('2026-07-13T12:00:00'), transparency: 'transparent' },
      ]);
      // All three are app blocks → all remain busy despite being transparent.
      expect(busy).toHaveLength(3);
    });

    it('still tags a transparent app-created BREAK ritual as a break', () => {
      const busy = eventsToBusyIntervals([
        { title: '🏋️ Exercise', startTime: d('2026-07-13T15:00:00'), endTime: d('2026-07-13T16:00:00'), transparency: 'transparent' },
      ]);
      expect(busy).toHaveLength(1);
      expect(busy[0].isBreak).toBe(true);
    });
  });
});

describe('outOfOfficeDates', () => {
  // A Friday working day 08:30–19:00 (matching Dave's live config window).
  const FRI = '2026-07-31';
  const at = (h: number, m = 0) => new Date(2026, 6, 31, h, m).getTime();
  const workingDays = [{ dateStr: FRI, whStartMs: at(8, 30), whEndMs: at(19, 0) }];

  it('detects a TIMED eventType=outOfOffice block spanning the whole day (Dave\'s real shape)', () => {
    const ooo = outOfOfficeDates(
      [
        {
          eventType: 'outOfOffice',
          title: '🌴 Out of office',
          startTime: new Date(2026, 6, 31, 0, 0),
          endTime: new Date(2026, 7, 1, 0, 0),
        },
      ],
      workingDays
    );
    expect(ooo.has(FRI)).toBe(true);
  });

  it('detects an ALL-DAY event whose title reads as OOO even without the eventType', () => {
    const ooo = outOfOfficeDates(
      [
        {
          allDay: true,
          title: 'Out of office',
          startTime: new Date(2026, 6, 31, 0, 0),
          endTime: new Date(2026, 7, 1, 0, 0),
        },
      ],
      workingDays
    );
    expect(ooo.has(FRI)).toBe(true);
  });

  it('does NOT count a half-day OOO (does not cover the whole working window)', () => {
    const ooo = outOfOfficeDates(
      [
        {
          eventType: 'outOfOffice',
          title: 'Afternoon off',
          startTime: new Date(2026, 6, 31, 13, 0),
          endTime: new Date(2026, 6, 31, 19, 0),
        },
      ],
      workingDays
    );
    expect(ooo.has(FRI)).toBe(false);
  });

  it('ignores ordinary busy events', () => {
    const ooo = outOfOfficeDates(
      [
        {
          eventType: 'default',
          title: 'All-day workshop',
          startTime: new Date(2026, 6, 31, 8, 30),
          endTime: new Date(2026, 6, 31, 19, 0),
        },
      ],
      workingDays
    );
    expect(ooo.has(FRI)).toBe(false);
  });
});
