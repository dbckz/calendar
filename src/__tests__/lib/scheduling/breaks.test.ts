/**
 * Tests for the pure break-gap placement pass. All Dates are built with the
 * local Date constructor so the tests are timezone-independent.
 */
import { proposeBreakBlocks } from '@/lib/scheduling/breaks';
import type { WorkingDay, WorkRun } from '@/lib/scheduling/engine';
import type { BusyInterval } from '@/lib/scheduling/types';

// Wednesday 2026-07-15, working hours 08:30–19:00 (matching the live config).
const YEAR = 2026;
const MONTH = 6; // July (0-based)
const DAY = 15;

function at(h: number, m: number): number {
  return new Date(YEAR, MONTH, DAY, h, m, 0, 0).getTime();
}

function workingDay(): WorkingDay {
  return {
    date: new Date(YEAR, MONTH, DAY, 0, 0, 0, 0),
    dateStr: '2026-07-15',
    whStartMs: at(8, 30),
    whEndMs: at(19, 0),
  };
}

function busy(h1: number, m1: number, h2: number, m2: number, isBreak = false): BusyInterval {
  return {
    start: new Date(YEAR, MONTH, DAY, h1, m1),
    end: new Date(YEAR, MONTH, DAY, h2, m2),
    ...(isBreak ? { isBreak: true } : {}),
  };
}

const WORK_RUN: WorkRun = { maxMinutes: 120, bufferMinutes: 15 };
// "Now" well before the working day so nothing is filtered by the now-cutoff.
const NOW = new Date(YEAR, MONTH, DAY, 6, 0, 0, 0);

describe('proposeBreakBlocks', () => {
  it('proposes a 15-min break at the end of each run except the last of the day', () => {
    // Two ~2h runs separated by a 15-min gap, then a final run to the end of day.
    // Runs: 09:00–11:00, 11:15–13:15, 13:30–15:30 (three runs; break after the
    // first two, none after the last).
    const breaks = proposeBreakBlocks({
      workingDays: [workingDay()],
      busyIntervals: [busy(9, 0, 11, 0), busy(11, 15, 13, 15), busy(13, 30, 15, 30)],
      workRun: WORK_RUN,
      now: NOW,
    });
    expect(breaks.map(b => b.start)).toEqual(['11:00', '13:15']);
    for (const b of breaks) {
      expect(b.kind).toBe('break');
      expect(b.title).toBe('☕ Break');
      expect(b.durationMinutes).toBe(15);
    }
  });

  it('never overlaps a break-tagged event (exercise right after the run IS the break)', () => {
    // Regression: run ends 13:30, 🏋️ Exercise 13:30–14:30 (isBreak) sits right
    // there, more work follows. The old code excluded break intervals from run
    // merging but never checked the proposed slot against them — so a "☕ Break"
    // was created ON TOP of exercise. Exercise already splits the runs; no break
    // event may be proposed inside it.
    const breaks = proposeBreakBlocks({
      workingDays: [workingDay()],
      busyIntervals: [
        busy(11, 30, 13, 30), // 2h run
        busy(13, 30, 14, 30, true), // exercise (break)
        busy(14, 30, 16, 0), // more work after
        busy(16, 15, 17, 0), // final run (so 16:00 break is not dangling)
      ],
      workRun: WORK_RUN,
      now: NOW,
    });
    // No break at 13:30 (inside exercise); the 16:00 run end still gets one.
    expect(breaks.map(b => b.start)).toEqual(['16:00']);
  });

  it('does not propose a dangling break after the final run of the day', () => {
    // A single run ending before the working day ends: no following busy time, so
    // no break (would be dangling).
    const breaks = proposeBreakBlocks({
      workingDays: [workingDay()],
      busyIntervals: [busy(9, 0, 11, 0)],
      workRun: WORK_RUN,
      now: NOW,
    });
    expect(breaks).toHaveLength(0);
  });

  it('treats a break interval (lunch) as splitting runs and still breaks after the earlier run', () => {
    // Run 09:00–11:00, lunch 11:30–12:00 (break interval), run 12:00–14:00.
    // The lunch splits the runs; a break is proposed at 11:00 (end of the first
    // run), not after the final 12:00–14:00 run.
    const breaks = proposeBreakBlocks({
      workingDays: [workingDay()],
      busyIntervals: [busy(9, 0, 11, 0), busy(11, 30, 12, 0, true), busy(12, 0, 14, 0)],
      workRun: WORK_RUN,
      now: NOW,
    });
    expect(breaks.map(b => b.start)).toEqual(['11:00']);
  });

  it('merges busy stretches within the buffer into one run (no break inside a run)', () => {
    // 09:00–10:00 and 10:10–11:00 are 10 min apart (< 15-min buffer) → one run.
    // Then a distinct run 11:30–13:00. Break only after the merged run's end.
    const breaks = proposeBreakBlocks({
      workingDays: [workingDay()],
      busyIntervals: [busy(9, 0, 10, 0), busy(10, 10, 11, 0), busy(11, 30, 13, 0)],
      workRun: WORK_RUN,
      now: NOW,
    });
    expect(breaks.map(b => b.start)).toEqual(['11:00']);
  });

  it('proposes nothing when there is only one run', () => {
    const breaks = proposeBreakBlocks({
      workingDays: [workingDay()],
      busyIntervals: [busy(9, 0, 11, 0), busy(11, 5, 13, 0)], // 5-min gap → merged into one run
      workRun: WORK_RUN,
      now: NOW,
    });
    expect(breaks).toHaveLength(0);
  });
});
