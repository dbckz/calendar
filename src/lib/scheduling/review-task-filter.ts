// Second-pass filter for the daily review's bare calendar-event blocks: drop the
// ones that aren't tasks at all.
//
// selectCalendarReviewBlocks() has already applied the deterministic heuristics
// (scheduling/not-a-task.ts). What survives can still be a non-task only judgement
// spots — a bare first name standing in for a catch-up being the common one — so
// each remaining title gets an AI verdict, cached per normalized title in
// dailyReviewState.titleVerdicts.
//
// Fail-open by design: a classifier error, a timeout or an omitted title leaves
// the block in the review. Over-asking is a nuisance; silently hiding real work
// is worse.

import {
  classifyReviewTitles,
  reviewTitleContentHash,
  REVIEW_TASK_PROMPT_VERSION,
  type ReviewTitleInput,
} from '@/lib/review-task-classifier';
import { mergeReviewTitleVerdicts } from '@/lib/user-data-storage';
import { buildExamplesBlock, isVerdictReusable } from '@/lib/classifier-learning';
import type { ReviewTitleVerdict } from '@/lib/storage/core';

import { normalizeReviewTitleKey } from './not-a-task';
import type { ReplanReviewBlock } from './replan';

export interface FilterReviewBlocksInput {
  blocks: ReplanReviewBlock[];
  // Cached verdicts from dailyReviewState.titleVerdicts.
  verdicts: Record<string, ReviewTitleVerdict>;
}

// Keep only the calendar-source blocks that are (or might be) real tasks. Blocks
// from any other source are returned untouched — they come from local task
// records, so they are tasks by construction.
export async function filterNonTaskReviewBlocks(
  input: FilterReviewBlocksInput
): Promise<ReplanReviewBlock[]> {
  const { blocks, verdicts } = input;
  const candidates = blocks.filter(b => b.source === 'calendar');
  // Always a FRESH array, never the caller's own — callers replace their list
  // with the result, so handing back the same reference would alias it.
  if (candidates.length === 0) return [...blocks];

  // One classifier input per unique title, so duplicates cost one verdict.
  const inputByKey = new Map<string, ReviewTitleInput>();
  const keyOf = new Map<string, string>(); // eventId -> key
  for (const block of candidates) {
    const title = block.titles[0] ?? '';
    const key = normalizeReviewTitleKey(title);
    keyOf.set(block.googleEventId, key);
    if (inputByKey.has(key)) continue;
    inputByKey.set(key, {
      key,
      title,
      durationMinutes: block.durationMinutes,
      isRecurring: false,
    });
  }

  // A user verdict is permanent; an AI verdict is reused while its content hash
  // and prompt version still match. Everything else needs classifying.
  const decided = new Map<string, boolean>();
  const toClassify: ReviewTitleInput[] = [];
  for (const [key, titleInput] of inputByKey) {
    const verdict = verdicts[key];
    if (isVerdictReusable(verdict, reviewTitleContentHash(titleInput), REVIEW_TASK_PROMPT_VERSION)) {
      decided.set(key, verdict!.isTask);
      continue;
    }
    toClassify.push(titleInput);
  }

  if (toClassify.length > 0) {
    // Feed Dave's own verdicts back as few-shot examples (keyed by title), so the
    // classifier follows his precedent — his dismissals AND the confirmations the
    // review records on apply. Empty → prompt unchanged.
    const examples = buildExamplesBlock(
      Object.entries(verdicts)
        .filter(([, v]) => v.decidedBy === 'user')
        .map(([key, v]) => ({ key, label: v.isTask ? 'yes' : 'no', at: v.updatedAt })),
      {
        heading:
          'The person has already judged these events themselves — treat them as ground truth and apply the same standard:',
        render: label => (label === 'yes' ? 'IS a task' : 'NOT a task'),
      }
    );
    try {
      const results = await classifyReviewTitles(toClassify, 90, examples);
      const byKey = new Map(results.map(r => [r.key, r]));
      const updatedAt = new Date().toISOString();
      const fresh: Record<string, ReviewTitleVerdict> = {};
      for (const titleInput of toClassify) {
        const result = byKey.get(titleInput.key);
        // Omitted by the model → keep the block (fail open), and don't cache a
        // verdict we never got.
        if (!result) {
          decided.set(titleInput.key, true);
          continue;
        }
        decided.set(titleInput.key, result.isTask);
        fresh[titleInput.key] = {
          isTask: result.isTask,
          decidedBy: 'ai',
          contentHash: reviewTitleContentHash(titleInput),
          promptVersion: REVIEW_TASK_PROMPT_VERSION,
          reason: result.reason,
          updatedAt,
        };
      }
      await mergeReviewTitleVerdicts(fresh);
    } catch (error) {
      console.error('[Daily Review] not-a-task classifier failed:', error);
      for (const titleInput of toClassify) decided.set(titleInput.key, true);
    }
  }

  return blocks.filter(block => {
    if (block.source !== 'calendar') return true;
    const key = keyOf.get(block.googleEventId);
    return key === undefined ? true : decided.get(key) !== false;
  });
}
