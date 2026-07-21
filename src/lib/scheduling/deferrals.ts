// Pure logic for task deferrals (used by gatherWeekContext).
//
// A deferral maps a task id (Asana gid or ad-hoc id) to the yyyy-MM-dd date it
// should resume as a planning candidate. A deferral is ACTIVE for a given week
// when its resume date falls AFTER the week's last day — i.e. the task is still
// parked and must stay out of the candidate pool. Once the resume date is within
// (or before) the week, the deferral has served its purpose and is EXPIRED, so
// it can be pruned lazily.

export interface DeferralPartition {
  active: Set<string>; // task ids still deferred this week (suppress as candidates)
  expired: string[]; // task ids whose deferral has elapsed (safe to delete)
}

// String yyyy-MM-dd dates compare correctly lexicographically.
export function partitionDeferrals(
  deferrals: Record<string, string>,
  weekEndStr: string
): DeferralPartition {
  const active = new Set<string>();
  const expired: string[] = [];
  for (const [taskId, until] of Object.entries(deferrals)) {
    if (until > weekEndStr) active.add(taskId);
    else expired.push(taskId);
  }
  return { active, expired };
}
