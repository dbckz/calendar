/**
 * Tests for the free-busy conversion used by the "Plan my week" scheduler.
 */
import { eventsToBusyIntervals, mergeIntervals } from '@/lib/scheduling/free-busy';

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
});
