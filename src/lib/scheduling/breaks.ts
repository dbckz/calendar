// Pure, deterministic break-gap placement.
//
// The work-run rule leaves a short buffer of free time after each continuous
// work run (~2h). This post-placement pass turns those buffers into VISIBLE
// calendar events: a 15-minute "☕ Break" at the end of every work run except the
// last one of the day (so there's never a dangling break after the final run).
//
// Like engine.ts / rituals.ts it is I/O-free: every input is passed in and the
// output is a plain list of ProposedBlocks, so the propose route stays thin and
// the logic is unit-testable. Breaks are tagged as break kind (they split work
// runs) and created + tracked exactly like rituals (in the ritualBlocks store).

import { timeStr, type WorkingDay, type WorkRun } from './engine';
import { BREAK_TITLE } from './rituals';
import type { BusyInterval, ProposedBlock } from './types';

const MS_PER_MINUTE = 60 * 1000;
export const BREAK_DURATION_MINUTES = 15;

// Given the FINAL busy timeline (calendar busy + placed prep + rituals + tasks)
// and the working days, propose a "☕ Break" at the end of each maxed-out work
// run. A run is a continuous stretch of NON-break busy time (breaks — lunch /
// exercise — split runs), formed by bridging gaps strictly smaller than the
// work-run buffer, exactly as the run rule does. A break is proposed at a run's
// end only when it is followed by more busy time that day (i.e. it is not the
// final run) and the 15-min break fits in the gap before the next run within
// working hours.
export function proposeBreakBlocks(params: {
  workingDays: WorkingDay[];
  busyIntervals: BusyInterval[];
  workRun: WorkRun;
  now: Date;
}): ProposedBlock[] {
  const { workingDays, workRun, now } = params;
  const nowMs = now.getTime();
  const bufferMs = workRun.bufferMinutes * MS_PER_MINUTE;
  const breakMs = BREAK_DURATION_MINUTES * MS_PER_MINUTE;
  const proposals: ProposedBlock[] = [];

  // Only NON-break busy time forms work runs (a break already splits a run).
  const workBusy = params.busyIntervals
    .filter(b => !b.isBreak)
    .map(b => ({ start: b.start.getTime(), end: b.end.getTime() }));

  for (const day of workingDays) {
    const winStart = Math.max(day.whStartMs, nowMs);
    const winEnd = day.whEndMs;
    if (winStart >= winEnd) continue;

    // Work intervals clipped to the working-hours window, earliest first.
    const clipped = workBusy
      .map(b => ({ start: Math.max(b.start, winStart), end: Math.min(b.end, winEnd) }))
      .filter(b => b.end > b.start)
      .sort((a, b) => a.start - b.start);
    if (clipped.length < 2) continue; // need at least two runs for a between-runs break

    // Merge into runs, bridging any gap strictly smaller than the buffer (a gap of
    // exactly bufferMinutes does NOT bridge — it separates two runs), mirroring the
    // run rule in engine.slotIsValid.
    const runs: Array<{ start: number; end: number }> = [];
    for (const iv of clipped) {
      const last = runs[runs.length - 1];
      if (last && iv.start - last.end < bufferMs) last.end = Math.max(last.end, iv.end);
      else runs.push({ start: iv.start, end: iv.end });
    }

    // Propose a break at the end of every run except the last (no dangling break
    // after the final run of the day). Skip when the gap can't hold the 15-min
    // break or the break wouldn't be in the future.
    for (let i = 0; i < runs.length - 1; i++) {
      const runEnd = runs[i].end;
      const nextStart = runs[i + 1].start;
      if (runEnd < nowMs) continue;
      if (nextStart - runEnd < breakMs) continue;
      if (runEnd + breakMs > winEnd) continue;
      const start = timeStr(runEnd);
      proposals.push({
        id: `${day.dateStr}-${start}-break`,
        category: 'Break',
        kind: 'break',
        title: BREAK_TITLE,
        date: day.dateStr,
        start,
        durationMinutes: BREAK_DURATION_MINUTES,
        reason: 'Short break after a focus run.',
      });
    }
  }

  return proposals;
}
