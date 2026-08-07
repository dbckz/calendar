import { NextRequest, NextResponse } from 'next/server';
import {
  classifyTasks,
  contentHash,
  PROMPT_VERSION,
  type ClassifierTask,
} from '@/lib/ai-classifier';
import {
  getAllAiClassification,
  saveAiClassification,
  getAiUserVerdicts,
  getAllTaskMetadata,
  upsertTaskMetadata,
  getAllDelegationEntries,
} from '@/lib/user-data-storage';
import { selectNewAiClaims, type AiClaimCandidate } from '@/lib/ai-verdicts';
import { excludedFromAiRunnable } from '@/lib/delegation-exclusion';
import { buildExamplesBlock } from '@/lib/classifier-learning';
import { AiClassificationEntry } from '@/types';

interface IncomingTask extends ClassifierTask {
  integrationId: string;
  dueOn?: string;
}

// POST { tasks: [{ gid, integrationId, title, description?, integrationName?, dueOn? }], mode? }
// Re-assess which tasks are AI-runnable. Tasks whose content hash AND the
// current prompt version match the cache are skipped (no LLM call); the rest are
// classified in one headless call. Verdicts are cached and mirrored onto each
// task's metadata.aiDelegable so the UI/badges reflect them.
//
// mode 'apply' (default) is the original behaviour, so any automatic/background
// caller is unchanged. mode 'review' is the manual dashboard button: fresh
// verdicts are still cached, but a NEW positive claim is NOT mirrored onto
// metadata — it comes back in `claims` for Dave to confirm or reject first (see
// POST /api/tasks/ai-verdicts). Negative verdicts apply in both modes, exactly
// as before.
//
// In BOTH modes Dave's own verdicts win: a task he has ruled out is never
// re-assessed, never claimed, and is pinned out of the AI-runnable list.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const tasks: IncomingTask[] = Array.isArray(body?.tasks) ? body.tasks : [];
    const mode: 'apply' | 'review' = body?.mode === 'review' ? 'review' : 'apply';
    if (tasks.length === 0) {
      return NextResponse.json({ error: 'tasks array is required' }, { status: 400 });
    }

    const [cache, userVerdicts, metadata, delegationQueue] = await Promise.all([
      getAllAiClassification(),
      getAiUserVerdicts(),
      getAllTaskMetadata(),
      getAllDelegationEntries(),
    ]);

    // Tasks delegated to an agent leave the AI-runnable queue until explicitly
    // returned (see delegation-exclusion). A re-assessment must never bring one
    // back automatically, so a positive verdict is not mirrored onto its
    // metadata and it is not offered as a claim.
    const excludedGids = excludedFromAiRunnable(delegationQueue);

    // Split into cached (unchanged) vs. needs-assessment. A task Dave RULED OUT is
    // skipped entirely — his rejection stands, so there is nothing to spend an LLM
    // call on. A positive verdict does NOT skip: an accepted task may still be
    // re-assessed (and legitimately re-claimed), exactly as before this learning
    // change added the positive class.
    const toAssess: IncomingTask[] = [];
    for (const task of tasks) {
      if (userVerdicts[task.gid]?.aiSuitable === false) continue;
      const hash = contentHash(task);
      const cached = cache[task.gid];
      if (!cached || cached.contentHash !== hash || cached.promptVersion !== PROMPT_VERSION) {
        toAssess.push(task);
      }
    }

    // Feed Dave's own verdicts back as few-shot examples so the classifier follows
    // his precedent. Titles come from the current batch (the only place a verdict
    // gid's title is to hand); verdicts for tasks not in the batch are simply not
    // shown. Empty → the prompt is unchanged.
    const titleByGid = new Map(tasks.map(t => [t.gid, t.title]));
    const examples = buildExamplesBlock(
      Object.entries(userVerdicts)
        .filter(([gid]) => titleByGid.has(gid))
        .map(([gid, v]) => ({
          key: titleByGid.get(gid) as string,
          label: v.aiSuitable ? 'yes' : 'no',
          at: v.decidedAt,
        })),
      {
        heading:
          'The person has already judged these tasks themselves — treat them as ground truth and apply the same standard:',
        render: label => (label === 'yes' ? 'AI-runnable' : 'NOT AI-runnable'),
      }
    );

    const results = await classifyTasks(toAssess, 180, examples);
    const byGid = new Map(results.map(r => [r.gid, r]));

    const now = new Date().toISOString();
    const newEntries: Record<string, AiClassificationEntry> = {};
    let changed = 0;

    for (const task of toAssess) {
      const verdict = byGid.get(task.gid);
      if (!verdict) continue; // model omitted this one — leave the prior verdict untouched
      const prior = cache[task.gid];
      newEntries[task.gid] = {
        contentHash: contentHash(task),
        promptVersion: PROMPT_VERSION,
        aiSuitable: verdict.aiSuitable,
        reason: verdict.reason,
        assessedAt: now,
      };
      if (!prior || prior.aiSuitable !== verdict.aiSuitable) changed += 1;
      // Mirror onto metadata so the AI-runnable section and 🤖 badge reflect it.
      // In review mode a NEW positive claim is held back until Dave confirms it;
      // everything else (negatives, and positives for tasks already accepted)
      // applies immediately, as it always has.
      // A delegated (excluded) task never has a positive verdict mirrored back
      // onto it either — that would silently re-add it to the AI-runnable queue.
      const awaitingConfirmation = mode === 'review' && metadata[task.gid]?.aiDelegable !== true;
      const holdBack =
        verdict.aiSuitable && (awaitingConfirmation || excludedGids.has(task.gid));
      if (!holdBack) {
        await upsertTaskMetadata(task.gid, task.integrationId, { aiDelegable: verdict.aiSuitable });
      }
    }

    if (Object.keys(newEntries).length > 0) {
      await saveAiClassification(newEntries);
    }

    // The claims to review: newly-claimed tasks that are neither already in the
    // list nor already ruled out. Built for every mode (cheap, and harmless to
    // report) but only acted on by the review flow.
    const candidates: AiClaimCandidate[] = tasks
      .filter(task => !excludedGids.has(task.gid))
      .map(task => ({
        gid: task.gid,
        integrationId: task.integrationId,
        title: task.title,
        integrationName: task.integrationName,
        dueOn: task.dueOn,
        reason: newEntries[task.gid]?.reason ?? cache[task.gid]?.reason,
        aiSuitable: newEntries[task.gid]?.aiSuitable ?? cache[task.gid]?.aiSuitable,
        alreadyAccepted: metadata[task.gid]?.aiDelegable === true,
        userVerdict: userVerdicts[task.gid],
      }));
    const claims = selectNewAiClaims(candidates);

    return NextResponse.json({
      total: tasks.length,
      assessed: Object.keys(newEntries).length,
      cached: tasks.length - toAssess.length,
      changed,
      claims,
      promptVersion: PROMPT_VERSION,
    });
  } catch (error) {
    console.error('Error classifying tasks:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to classify tasks' },
      { status: 500 }
    );
  }
}
