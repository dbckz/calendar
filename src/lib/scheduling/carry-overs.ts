// Pure logic for task carry-overs (used by gatherWeekContext).
//
// A carry-over marks a task the user explicitly carried out of a week during
// that week's end-of-week review. It is ACTIVE for the week being planned when
// it was carried out of an EARLIER week — carrying out of the week you are
// currently planning is not "last week's leftover", so it earns no badge. An
// entry older than CARRY_OVER_MAX_AGE_WEEKS is stale and pruned lazily.

import type { CarryOverEntry } from '@/lib/storage/core';

// How many weeks a carry-over marker survives before it is pruned on read.
export const CARRY_OVER_MAX_AGE_WEEKS = 4;

export interface CarriedTaskInfo {
  fromWeek: string;
  // Consecutive end-of-week carries (1 = carried once).
  carries: number;
  mustDo: boolean;
}

export interface CarryOverPartition {
  // taskId -> what we know about its carry, for entries that predate the week
  // being planned (these are the badge-worthy ones).
  carriedFromWeek: Map<string, string>;
  carried: Map<string, CarriedTaskInfo>;
  stale: string[]; // taskIds whose entry is too old to keep
}

// yyyy-MM-dd strings compare correctly lexicographically.
export function partitionCarryOvers(
  carryOvers: Record<string, CarryOverEntry>,
  weekStartStr: string,
  maxAgeWeeks: number = CARRY_OVER_MAX_AGE_WEEKS
): CarryOverPartition {
  const carriedFromWeek = new Map<string, string>();
  const carried = new Map<string, CarriedTaskInfo>();
  const stale: string[] = [];
  const cutoff = shiftWeeks(weekStartStr, -maxAgeWeeks);
  for (const [taskId, entry] of Object.entries(carryOvers)) {
    if (!entry?.fromWeek) {
      stale.push(taskId);
      continue;
    }
    if (entry.fromWeek < cutoff) {
      stale.push(taskId);
      continue;
    }
    if (entry.fromWeek < weekStartStr) {
      carriedFromWeek.set(taskId, entry.fromWeek);
      carried.set(taskId, {
        fromWeek: entry.fromWeek,
        carries: entry.carries ?? 1,
        mustDo: entry.mustDo === true,
      });
    }
  }
  return { carriedFromWeek, carried, stale };
}

// yyyy-MM-dd shifted by whole weeks, in UTC so no DST boundary can shift the date.
function shiftWeeks(dateStr: string, weeks: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return date.toISOString().slice(0, 10);
}
