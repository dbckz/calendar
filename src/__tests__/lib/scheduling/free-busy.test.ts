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

  it('merges overlapping timed events across the list', () => {
    const busy = eventsToBusyIntervals([
      { startTime: d('2026-07-13T09:00:00'), endTime: d('2026-07-13T10:00:00') },
      { startTime: d('2026-07-13T09:30:00'), endTime: d('2026-07-13T11:00:00') },
    ]);
    expect(busy).toHaveLength(1);
    expect(busy[0].end).toEqual(d('2026-07-13T11:00:00'));
  });
});
