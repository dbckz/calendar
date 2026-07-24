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
  excludeMorningWindows,
  findSlot,
  MORNING_PREP_EXCLUSION_MINUTES,
  parseTimeOfDay,
  preferredWindowsForCategory,
  resolveWorkingWindow,
  timeStr,
  type BusyMs,
  type Window,
  type WorkingDay,
} from './engine';
import { proposeRitualBlocks } from './rituals';
import type { BusyInterval, ProposedBlock } from './types';

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
  // Present only on meeting-prep blocks: the prep must be re-slotted to END
  // before its meeting starts (absolute ms). If the meeting is already past, or
  // no slot fits before it, the block is returned as `stale` instead of moved.
  mustEndBeforeMs?: number;
  // Ritual/break blocks (lunch/exercise/emails/kindle/grooming/retro/break). A
  // ritual is NEVER "missed" (a skipped ritual is not rescheduled); only a future
  // ritual that now conflicts with a meeting is moved, re-slotted into its ritual
  // window (or its category's afternoon window for the WORK rituals). A future
  // 'break' that conflicts is DELETED instead of moved — a break has no fixed
  // home. `isBreak` (lunch / exercise / break) splits work runs.
  ritualKind?: 'lunch' | 'exercise' | 'emails' | 'kindleNotes' | 'grooming' | 'retro' | 'break';
  isBreak?: boolean;
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
  // An optional evening-overflow slot (in the configured overflow window) found
  // for this block. When present the UI can offer "try evening overflow", which
  // moves the block here. Absent when no overflow window is configured or no slot
  // fits.
  overflowOption?: { date: string; start: string; durationMinutes: number };
  // Task ids (Asana gid / ad-hoc id) backing this block, so the confirm route can
  // defer them. Populated by the analyze route (planReplan leaves it undefined).
  deferTaskIds?: string[];
}

// A prep block that can no longer be usefully re-slotted: its meeting has
// already happened, or no slot fits before the meeting starts. Offered to the
// user only as "mark done" / dismiss.
export interface ReplanStale {
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
  // Per-date set of ritual titles already present on the calendar this week
  // (exact-match on "🍽️ Lunch" / "🏋️ Exercise" / "📧 Emails"), from the LIVE
  // events so a manually-added ritual counts. When provided, every remaining
  // working day missing a ritual gets an `additions` proposal (exercise is the
  // number-one priority and must land every working day). Omit to skip additions.
  existingRitualTitlesByDate?: Record<string, Set<string>>;
}

// A break block that now conflicts with a meeting. Breaks have no fixed home, so
// a conflicted future one is DELETED (calendar event + tracking record) rather
// than re-slotted.
export interface ReplanDeletion {
  googleEventId: string;
  googleIntegrationId?: string;
  category: string;
  titles: string[];
  oldDate: string;
  oldStart: string;
  durationMinutes: number;
  reason: ReplanReason;
}

// --- Daily review ---
// A single unit of work under a review block. Asana tasks carry a `gid`
// (+ `integrationId`) so they can be completed in Asana; ad-hoc tasks carry an
// `adhocId`; a prep block has one task with neither. `done` is the task's
// current completion state (from the live Asana fetch / stored flag).
export interface ReplanReviewTask {
  title: string;
  done: boolean;
  gid?: string;
  integrationId?: string;
  adhocId?: string;
  // True when this Asana task is `done` because it is already complete in Asana
  // (absent from the live incomplete fetch), as opposed to a "done for planning"
  // override. The review UI explains the pre-ticked state and hides the
  // "Complete in Asana" affordance (there is nothing left to complete).
  completedInAsana?: boolean;
}

// A PAST app block (task or prep, never ritual/break) surfaced in the daily
// review so the user can confirm what did / didn't get done. `done` is the
// block-level completion state; `tasks` lists each underlying task (one entry
// for ad-hoc/prep, several for a grouped Asana block).
export interface ReplanReviewBlock {
  googleEventId: string;
  googleIntegrationId?: string;
  kind: 'task' | 'prep';
  // 'calendar' marks a block adopted from a bare Google Calendar event with no
  // local record (added directly in Google, not by the planner). The review UI
  // badges these separately, and the apply "adopts" a not-done one into a local
  // task so the replan step can re-slot it. Absent for the app-owned sources.
  source?: 'calendar';
  category: string;
  date: string; // stored yyyy-MM-dd
  start: string; // stored HH:mm
  durationMinutes: number;
  // The block's ACTUAL interval (matched from the calendar event where possible,
  // else derived from the stored slot). `date`/`start` above are the STORED slot,
  // kept for the apply payload; `startMs`/`endMs` are what the review displays so
  // a dragged event shows its real time rather than a stale stored one.
  startMs: number;
  endMs: number;
  done: boolean;
  titles: string[];
  tasks: ReplanReviewTask[];
}

export interface ReplanResult {
  kept: ReplanKept[];
  moves: ReplanMove[];
  unplaceable: ReplanUnplaceable[];
  stale: ReplanStale[];
  // Missing rituals to ADD on remaining working days (new events, no existing
  // googleEventId). Empty when no ritual titles context was supplied.
  additions: ProposedBlock[];
  // Break blocks that now conflict with a meeting → delete (no fixed home).
  deletions: ReplanDeletion[];
  // Whether an evening-overflow window exists on any remaining working day. When
  // true but an unplaceable block still has no `overflowOption`, the evening
  // window filled up (earlier blocks reserved its slots) — the UI uses this to
  // explain why the "try evening overflow" option is absent rather than hiding
  // it silently. False when no overflow window is configured at all.
  overflowConfigured: boolean;
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

  const { workingHoursEnd, workRun, workingDays } = resolveWorkingWindow(
    config.scheduling,
    weekStart,
    now
  );

  const otherBusyMs: BusyMs[] = input.otherBusy.map(i => ({
    start: i.start.getTime(),
    end: i.end.getTime(),
    isBreak: i.isBreak,
  }));

  // --- Classify ---
  const kept: ReplanKept[] = [];
  const toMove: Array<{ block: ReplanBlock; reason: ReplanReason }> = [];
  const deletions: ReplanDeletion[] = [];
  // Kept blocks re-enter the busy set for re-slotting; lunch rituals keep their
  // break flag so they split runs rather than count as work.
  const keptBusy: BusyMs[] = [];

  const keep = (block: ReplanBlock) => {
    kept.push({
      googleEventId: block.googleEventId,
      category: block.category,
      titles: block.titles,
      date: block.date,
      start: block.start,
      durationMinutes: block.durationMinutes,
    });
    keptBusy.push({ ...intervalOf(block.date, block.start, block.durationMinutes), isBreak: block.isBreak });
  };

  for (const block of blocks) {
    if (block.done) {
      keep(block);
    } else if (block.ritualKind && block.endMs <= nowMs) {
      // A past ritual is never "missed" — a skipped lunch/emails isn't rescheduled.
      keep(block);
    } else if (!block.ritualKind && !block.done && block.endMs <= nowMs) {
      toMove.push({ block, reason: 'missed' });
    } else if (
      !block.done &&
      block.endMs > nowMs &&
      overlapsAny(block.startMs, block.endMs, otherBusyMs)
    ) {
      // A future break that now conflicts is DELETED (no fixed home); everything
      // else is re-slotted.
      if (block.ritualKind === 'break') {
        deletions.push({
          googleEventId: block.googleEventId,
          googleIntegrationId: block.googleIntegrationId,
          category: block.category,
          titles: block.titles,
          oldDate: block.date,
          oldStart: block.start,
          durationMinutes: block.durationMinutes,
          reason: 'conflict',
        });
      } else {
        toMove.push({ block, reason: 'conflict' });
      }
    } else {
      keep(block);
    }
  }

  // --- Re-slot the movers ---
  // Base busy = non-app intervals + kept blocks. Moves placed in this run are
  // appended as we go so movers never collide with each other.
  const busy: BusyMs[] = [...otherBusyMs, ...keptBusy];

  // Earliest original start first, so blocks reclaim time in a stable order.
  toMove.sort((a, b) => a.block.startMs - b.block.startMs);

  const moves: ReplanMove[] = [];
  const unplaceable: ReplanUnplaceable[] = [];
  const stale: ReplanStale[] = [];

  const staleOf = (block: ReplanBlock, reason: ReplanReason): ReplanStale => ({
    googleEventId: block.googleEventId,
    googleIntegrationId: block.googleIntegrationId,
    category: block.category,
    titles: block.titles,
    oldDate: block.date,
    oldStart: block.start,
    durationMinutes: block.durationMinutes,
    reason,
  });

  for (const { block, reason } of toMove) {
    // A prep block whose meeting has already started/passed can never be
    // usefully re-slotted → stale.
    if (block.mustEndBeforeMs !== undefined && block.mustEndBeforeMs <= nowMs) {
      stale.push(staleOf(block, reason));
      continue;
    }

    // Ritual movers re-slot into their ritual window (lunch prefers 11:30–13:00,
    // exercise near 15:00, emails the end of the working day); the WORK rituals
    // (kindle / grooming / retro) and every non-ritual block use their category's
    // preferred/afternoon-default windows. Breaks are never re-slotted (they're
    // deleted on conflict), so a mover here is never a break.
    const usesRitualWindow =
      block.ritualKind === 'lunch' ||
      block.ritualKind === 'exercise' ||
      block.ritualKind === 'emails';
    let windows = usesRitualWindow
      ? ritualWindows(block.ritualKind as 'lunch' | 'exercise' | 'emails', workingDays)
      : buildWindowsForTask(
          undefined,
          preferredWindowsForCategory(config, block.category, workingHoursEnd),
          workingDays
        );
    // Prep constraint: the new slot must END before the meeting starts. Cap each
    // window's end at the meeting start; drop windows left with no room. Prep also
    // never starts a day (deep work / todos / meetings first), so exclude the
    // first MORNING_PREP_EXCLUSION_MINUTES of each working day — the same rule the
    // initial prep placer applies.
    if (block.mustEndBeforeMs !== undefined) {
      windows = excludeMorningWindows(windows, workingDays, MORNING_PREP_EXCLUSION_MINUTES);
      windows = capWindows(windows, block.mustEndBeforeMs);
    }
    const slot = findSlot(windows, block.durationMinutes, workRun, busy, nowMs);

    if (!slot) {
      // No fit before the meeting → stale for prep blocks; unplaceable otherwise.
      if (block.mustEndBeforeMs !== undefined) {
        stale.push(staleOf(block, reason));
      } else {
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
      }
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
    busy.push({ start: slot.startMs, end: slot.endMs, isBreak: block.isBreak });
  }

  // --- Overflow options: an optional evening slot for each unplaceable block ---
  // For blocks that found no home in working hours, try the configured overflow
  // window (e.g. 21:00–23:00) on the remaining days against the final busy set,
  // reserving each so two options never overlap. Offered opt-in in the UI.
  const ofWindows = buildOverflowWindows(config, workingDays);
  if (ofWindows.length > 0) {
    for (const u of unplaceable) {
      const slot = findSlot(ofWindows, u.durationMinutes, workRun, busy, nowMs);
      if (!slot) continue;
      u.overflowOption = { date: slot.dateStr, start: timeStr(slot.startMs), durationMinutes: u.durationMinutes };
      busy.push({ start: slot.startMs, end: slot.endMs });
    }
  }

  // --- Additions: fill missing rituals on remaining working days ---
  // Reuse the pure ritual placer against the FINAL busy set (non-app intervals +
  // kept blocks + placed moves), deduped by the live ritual titles per date, so
  // any remaining working day without a ritual event gets one proposed. Exercise
  // is priority one: its whole-day fallback (in proposeRitualBlocks) applies here
  // too, so it lands on every day with a free hour.
  let additions: ProposedBlock[] = [];
  if (input.existingRitualTitlesByDate) {
    const additionBusy: BusyInterval[] = busy.map(b => ({
      start: new Date(b.start),
      end: new Date(b.end),
      ...(b.isBreak ? { isBreak: true } : {}),
    }));
    additions = proposeRitualBlocks({
      config,
      busyIntervals: additionBusy,
      weekStart,
      now,
      existingRitualTitlesByDate: input.existingRitualTitlesByDate,
    });
  }

  return { kept, moves, unplaceable, stale, additions, deletions, overflowConfigured: ofWindows.length > 0 };
}

// Build ritual re-slot windows across the remaining working days. Lunch prefers
// 11:30–13:00 (falling back to 11:00–14:00); exercise prefers a 15:00 start,
// widening outward toward 13:00–18:00; emails prefers the final two hours of the
// working day (falling back to the wider afternoon from 12:00).
function ritualWindows(kind: 'lunch' | 'exercise' | 'emails', workingDays: WorkingDay[]): Window[] {
  const at = (day: WorkingDay, h: number, m: number): number =>
    new Date(day.date.getFullYear(), day.date.getMonth(), day.date.getDate(), h, m, 0, 0).getTime();

  const tiers: Array<(day: WorkingDay) => { startMs: number; endMs: number }> =
    kind === 'lunch'
      ? [
          day => ({ startMs: at(day, 11, 30), endMs: at(day, 13, 0) }),
          day => ({ startMs: at(day, 11, 0), endMs: at(day, 14, 0) }),
        ]
      : kind === 'exercise'
        ? [
            // Tier 1 fits only a 60-min block starting at 15:00; wider tiers keep
            // it near mid-afternoon before the full 13:00–18:00 fallback.
            day => ({ startMs: at(day, 15, 0), endMs: at(day, 16, 0) }),
            day => ({ startMs: at(day, 14, 0), endMs: at(day, 17, 0) }),
            day => ({ startMs: at(day, 13, 0), endMs: at(day, 18, 0) }),
          ]
        : [
          day => ({ startMs: Math.max(day.whEndMs - 2 * 60 * 60 * 1000, day.whStartMs), endMs: day.whEndMs }),
          day => ({ startMs: Math.max(at(day, 12, 0), day.whStartMs), endMs: day.whEndMs }),
        ];

  const windows: Window[] = [];
  for (const tier of tiers) {
    for (const day of workingDays) {
      const { startMs, endMs } = tier(day);
      if (endMs <= startMs) continue;
      windows.push({ date: day.date, dateStr: day.dateStr, startMs, endMs, preferred: false, bestTimeMatch: false });
    }
  }
  return windows;
}

// Build the evening-overflow windows (config.scheduling.overflow, e.g.
// 21:00–23:00) across the remaining working days. Empty when no overflow window
// is configured. Mirrors the overflow-window construction in engine.ts.
function buildOverflowWindows(config: WorkflowConfig, workingDays: WorkingDay[]): Window[] {
  const start = config.scheduling.overflow ? parseTimeOfDay(config.scheduling.overflow.start) : null;
  const end = config.scheduling.overflow ? parseTimeOfDay(config.scheduling.overflow.end) : null;
  if (!start || !end) return [];
  const at = (day: WorkingDay, t: { h: number; m: number }): number =>
    new Date(day.date.getFullYear(), day.date.getMonth(), day.date.getDate(), t.h, t.m, 0, 0).getTime();
  const windows: Window[] = [];
  for (const day of workingDays) {
    const startMs = at(day, start);
    const endMs = at(day, end);
    if (endMs > startMs) {
      windows.push({ date: day.date, dateStr: day.dateStr, startMs, endMs, preferred: false, bestTimeMatch: false });
    }
  }
  return windows.sort((a, b) => a.startMs - b.startMs);
}

// Cap each window's end at `capMs` (a prep block's meeting start), dropping any
// window left with no room for a slot.
function capWindows(windows: Window[], capMs: number): Window[] {
  const out: Window[] = [];
  for (const w of windows) {
    const endMs = Math.min(w.endMs, capMs);
    if (endMs > w.startMs) out.push({ ...w, endMs });
  }
  return out;
}

// Absolute-ms interval for a local yyyy-MM-dd + HH:mm + duration.
function intervalOf(date: string, start: string, durationMinutes: number): BusyMs {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, m] = start.split(':').map(Number);
  const startMs = new Date(y, mo - 1, d, h, m, 0, 0).getTime();
  return { start: startMs, end: startMs + durationMinutes * MS_PER_MINUTE };
}
