// Pure mapping for the daily-review "Step 1 — Review" apply.
//
// Given this week's past app blocks (from the replan analyze `reviewBlocks`) and
// the user's per-task Done / Complete-in-Asana marks, work out the confirm-route
// payload that records what did and didn't get done. Kept I/O-free so it is
// unit-testable and the modal + route stay thin.
//
// The three output channels all feed the SINGLE replan confirm route:
//   * done[]         — event ids to record done for planning (prep → done:true,
//                      ad-hoc → completed:true, else a block-level override).
//   * notDone[]      — event ids to clear back to not-done so the next analyze
//                      classifies them as missed (reverse of done[]).
//   * completeAsana  — Asana tasks to complete in Asana directly; once complete
//                      they drop out of the next analyze's incomplete fetch.
//
// Only CHANGES are emitted: a block already in its target state produces nothing.
// Note: unchecking a genuinely Asana-complete task cannot re-open it in Asana
// (we never re-open tasks); notDone[] only clears any planning override.

import type { ReplanReviewBlock } from './replan';

export interface ReviewTaskMark {
  done: boolean;
  completeInAsana: boolean; // only meaningful for Asana-backed tasks
}

export interface ReviewBlockMark {
  tasks: ReviewTaskMark[]; // aligned by index with the block's tasks
}

export interface ReviewApplyPayload {
  done: string[];
  notDone: string[];
  completeAsana: Array<{ gid: string; integrationId: string }>;
}

export function buildReviewApplyPayload(
  blocks: ReplanReviewBlock[],
  marks: Record<string, ReviewBlockMark>
): ReviewApplyPayload {
  const done: string[] = [];
  const notDone: string[] = [];
  const completeAsana: Array<{ gid: string; integrationId: string }> = [];

  for (const block of blocks) {
    const mark = marks[block.googleEventId];
    if (!mark) continue;

    // The user's intended done-state per task (default: leave as-is).
    const wants = block.tasks.map((t, i) => mark.tasks[i]?.done ?? t.done);
    const allWantDone = wants.every(Boolean);

    // Complete-in-Asana for any Asana task newly marked done with the box ticked.
    block.tasks.forEach((t, i) => {
      if (t.gid && t.integrationId && wants[i] && !t.done && mark.tasks[i]?.completeInAsana) {
        completeAsana.push({ gid: t.gid, integrationId: t.integrationId });
      }
    });

    const isAsana = block.tasks.some(t => t.gid);
    if (isAsana) {
      // A whole-block override is only needed when every task should be done but
      // at least one of them is NOT being completed in Asana (so nothing else
      // would register it as done).
      const needOverride =
        allWantDone &&
        block.tasks.some((t, i) => wants[i] && !t.done && !mark.tasks[i]?.completeInAsana);
      if (allWantDone && needOverride && !block.done) {
        done.push(block.googleEventId);
      } else if (!allWantDone && block.done) {
        notDone.push(block.googleEventId);
      }
    } else {
      // Prep / ad-hoc: a single task, recorded via the confirm route's own owner
      // resolution (prep → done, ad-hoc → completed).
      const want = wants[0];
      if (want && !block.done) done.push(block.googleEventId);
      else if (!want && block.done) notDone.push(block.googleEventId);
    }
  }

  return { done, notDone, completeAsana };
}
