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
import { stripLeadingEmoji } from './calendar-review';

export interface ReviewTaskMark {
  done: boolean;
  completeInAsana: boolean; // only meaningful for Asana-backed tasks
}

export interface ReviewBlockMark {
  tasks: ReviewTaskMark[]; // aligned by index with the block's tasks
}

// A bare calendar event (source 'calendar') the user left NOT done: adopted into
// a local record so the replan step can re-slot it. Asana-matched events become a
// scheduled Asana block (gid set); the rest become an ad-hoc task.
export interface ReviewAdoptInput {
  googleEventId: string;
  googleIntegrationId?: string;
  title: string; // emoji-stripped
  date: string; // yyyy-MM-dd
  start: string; // HH:mm
  durationMinutes: number;
  gid?: string;
  integrationId?: string;
}

export interface ReviewApplyPayload {
  done: string[];
  notDone: string[];
  completeAsana: Array<{ gid: string; integrationId: string }>;
  adopt: ReviewAdoptInput[];
}

export function buildReviewApplyPayload(
  blocks: ReplanReviewBlock[],
  marks: Record<string, ReviewBlockMark>
): ReviewApplyPayload {
  const done: string[] = [];
  const notDone: string[] = [];
  const completeAsana: Array<{ gid: string; integrationId: string }> = [];
  const adopt: ReviewAdoptInput[] = [];

  for (const block of blocks) {
    const mark = marks[block.googleEventId];
    if (!mark) continue;

    // The user's intended done-state per task (default: leave as-is).
    const wants = block.tasks.map((t, i) => mark.tasks[i]?.done ?? t.done);
    const allWantDone = wants.every(Boolean);

    // Bare calendar events have no local record: a done one just gets a planning
    // override (and completes in Asana if matched + ticked); a not-done one is
    // ADOPTED so the replan step can re-slot it. There is exactly one task.
    if (block.source === 'calendar') {
      const task = block.tasks[0];
      const want = wants[0];
      if (want) {
        if (task.gid && task.integrationId && !task.done && mark.tasks[0]?.completeInAsana) {
          completeAsana.push({ gid: task.gid, integrationId: task.integrationId });
        }
        // Record a done override so the event doesn't resurface for review/adoption.
        if (!block.done) done.push(block.googleEventId);
      } else {
        // Clear any stale override before adopting, so the adopted record reads as
        // missed (a lingering override would mark it done for planning).
        if (block.done) notDone.push(block.googleEventId);
        adopt.push({
          googleEventId: block.googleEventId,
          googleIntegrationId: block.googleIntegrationId,
          title: stripLeadingEmoji(task.title) || task.title,
          date: block.date,
          start: block.start,
          durationMinutes: block.durationMinutes,
          ...(task.gid && task.integrationId
            ? { gid: task.gid, integrationId: task.integrationId }
            : {}),
        });
      }
      continue;
    }

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

  return { done, notDone, completeAsana, adopt };
}
