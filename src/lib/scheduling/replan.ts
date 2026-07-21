// Pure, deterministic "Mid-week replan" logic.
//
// Given this week's app-created blocks (Google events the planner made, each
// tied to Asana/ad-hoc work) plus the busy intervals of everything that is NOT
// an app block (real meetings), planReplan() classifies each block and proposes
// new slots for the ones that need moving. Like engine.ts / prep.ts it is
// I/O-free: every input is passed in and the output is a plain object, so the
// routes stay thin and the logic is heavily unit-testable.
//
// Classification (per block):
//  * MISSED    — the block's linked work is not done AND the block has already
//                ended (endMs <= now). It needs a fresh slot in the remaining
//                week.
//  * CONFLICTED — the block is not done, has not ended yet, and now overlaps a
//                non-app busy interval (e.g. a meeting booked since planning).
//                App blocks are excluded from `otherBusy`, so two app blocks
//                overlapping each other is never a conflict; only a real event
//                overlapping the block is.
//  * KEPT      — everything else (done, or future with no conflict). Untouched.
//
// Re-slotting (missed + conflicted, earliest original start first): remaining
// days only (buildWorkingDays drops past days; the now-cutoff handles today),
// preserving each block's duration and category. Busy = the non-app intervals
// PLUS kept blocks PLUS moves already placed in this run; the moving blocks'
// own old intervals are absent (they are app blocks, never in `otherBusy`), so
// their time is free to reuse. Category preferred-time windows are derived the
// same way proposeBlocks does, including the afternoon-default rule for
// non-deep-work categories with no configured preferredTimes (deep work keeps
// mornings). Blocks that fit nowhere are returned as `unplaceable`.

import type { WorkflowConfig } from '@/lib/workflow-config-storage';

import {
  buildWindowsForTask,
  findSlot,
  preferredWindowsForCategory,
  resolveWorkingWindow,
  timeStr,
  type BusyMs,
} from './engine';
import type { BusyInterval } from './types';

// An app-created block on this week's calendar. `startMs`/`endMs` are its actual
// interval (matched from the calendar event where possible, else derived from
// the stored schedule). `done` is whether its linked work is complete.
export interface ReplanBlock {
  googleEventId: string;
  googleIntegrationId?: string;
  category: string;
  date: string; // stored yyyy-MM-dd
  start: string; // stored HH:mm
  durationMinutes: number;
  titles: string[];
  done: boolean;
  startMs: number;
  endMs: number;
}

export type ReplanReason = 'missed' | 'conflict';

export interface ReplanKept {
  googleEventId: string;
  category: string;
  titles: string[];
  date: string;
  start: string;
  durationMinutes: number;
}

export interface ReplanMove {
  googleEventId: string;
  googleIntegrationId?: string;
  category: string;
  titles: string[];
  oldDate: string;
  oldStart: string;
  newDate: string;
  newStart: string;
  durationMinutes: number;
  reason: ReplanReason;
}

export interface ReplanUnplaceable {
  googleEventId: string;
  googleIntegrationId?: string;
  category: string;
  titles: string[];
  oldDate: string;
  oldStart: string;
  durationMinutes: number;
  reason: ReplanReason;
}

export interface ReplanInput {
  config: WorkflowConfig;
  weekStart: Date; // local midnight of the week's Monday
  now: Date;
  blocks: ReplanBlock[];
  // Busy intervals from everything that is NOT an app block (real meetings /
  // external events). Used both for conflict detection and as the re-slotting
  // base busy set.
  otherBusy: BusyInterval[];
}

export interface ReplanResult {
  kept: ReplanKept[];
  moves: ReplanMove[];
  unplaceable: ReplanUnplaceable[];
}

const MS_PER_MINUTE = 60 * 1000;

// Does [startMs, endMs) overlap any of the busy intervals? Touching boundaries
// (one ends exactly where the other starts) do not count as overlap.
function overlapsAny(startMs: number, endMs: number, busy: BusyMs[]): boolean {
  for (const b of busy) {
    if (b.start < endMs && b.end > startMs) return true;
  }
  return false;
}

export function planReplan(input: ReplanInput): ReplanResult {
  const { config, weekStart, now, blocks } = input;
  const nowMs = now.getTime();

  const { workingHoursEnd, buffer, workingDays } = resolveWorkingWindow(
    config.scheduling,
    weekStart,
    now
  );

  const otherBusyMs: BusyMs[] = input.otherBusy.map(i => ({
    start: i.start.getTime(),
    end: i.end.getTime(),
  }));

  // --- Classify ---
  const kept: ReplanKept[] = [];
  const toMove: Array<{ block: ReplanBlock; reason: ReplanReason }> = [];

  for (const block of blocks) {
    if (!block.done && block.endMs <= nowMs) {
      toMove.push({ block, reason: 'missed' });
    } else if (
      !block.done &&
      block.endMs > nowMs &&
      overlapsAny(block.startMs, block.endMs, otherBusyMs)
    ) {
      toMove.push({ block, reason: 'conflict' });
    } else {
      kept.push({
        googleEventId: block.googleEventId,
        category: block.category,
        titles: block.titles,
        date: block.date,
        start: block.start,
        durationMinutes: block.durationMinutes,
      });
    }
  }

  // --- Re-slot the movers ---
  // Base busy = non-app intervals + kept blocks. Moves placed in this run are
  // appended as we go so movers never collide with each other.
  const busy: BusyMs[] = [...otherBusyMs];
  for (const k of kept) {
    busy.push(intervalOf(k.date, k.start, k.durationMinutes));
  }

  // Earliest original start first, so blocks reclaim time in a stable order.
  toMove.sort((a, b) => a.block.startMs - b.block.startMs);

  const moves: ReplanMove[] = [];
  const unplaceable: ReplanUnplaceable[] = [];

  for (const { block, reason } of toMove) {
    const preferredWindows = preferredWindowsForCategory(config, block.category, workingHoursEnd);
    const windows = buildWindowsForTask(undefined, preferredWindows, workingDays);
    const slot = findSlot(windows, block.durationMinutes, buffer, busy, nowMs);

    if (!slot) {
      unplaceable.push({
        googleEventId: block.googleEventId,
        googleIntegrationId: block.googleIntegrationId,
        category: block.category,
        titles: block.titles,
        oldDate: block.date,
        oldStart: block.start,
        durationMinutes: block.durationMinutes,
        reason,
      });
      continue;
    }

    moves.push({
      googleEventId: block.googleEventId,
      googleIntegrationId: block.googleIntegrationId,
      category: block.category,
      titles: block.titles,
      oldDate: block.date,
      oldStart: block.start,
      newDate: slot.dateStr,
      newStart: timeStr(slot.startMs),
      durationMinutes: block.durationMinutes,
      reason,
    });
    busy.push({ start: slot.startMs, end: slot.endMs });
  }

  return { kept, moves, unplaceable };
}

// Absolute-ms interval for a local yyyy-MM-dd + HH:mm + duration.
function intervalOf(date: string, start: string, durationMinutes: number): BusyMs {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, m] = start.split(':').map(Number);
  const startMs = new Date(y, mo - 1, d, h, m, 0, 0).getTime();
  return { start: startMs, end: startMs + durationMinutes * MS_PER_MINUTE };
}
