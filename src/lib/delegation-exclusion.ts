// One rule, shared by the desktop and mobile AI-runnable panels and the
// classify-ai route, for whether a task is excluded from the AI-runnable queue
// because it has been delegated.
//
// Once a task is delegated to an agent it leaves the AI-runnable queue
// PERMANENTLY: a delegation entry exists for its gid, in any state (queued,
// running, done, failed) and whether or not its finished run has been reviewed.
// The only way back is an explicit "Return to AI queue" (which stamps
// returnedToAiAt); it never returns automatically.

import { DelegationQueueEntry } from '@/types';

// True when a delegation entry keeps the task out of the AI-runnable queue.
export function isExcludedFromAiRunnable(entry: DelegationQueueEntry | undefined): boolean {
  return !!entry && !entry.returnedToAiAt;
}

// The set of task GIDs excluded from the AI-runnable queue, given the whole
// delegation queue. Used server-side (classify-ai) to filter claims and mirrors.
export function excludedFromAiRunnable(
  delegationByGid: Record<string, DelegationQueueEntry>
): Set<string> {
  const excluded = new Set<string>();
  for (const entry of Object.values(delegationByGid)) {
    if (isExcludedFromAiRunnable(entry)) excluded.add(entry.asanaTaskGid);
  }
  return excluded;
}
