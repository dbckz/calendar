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
  upsertTaskMetadata,
} from '@/lib/user-data-storage';
import { AiClassificationEntry } from '@/types';

interface IncomingTask extends ClassifierTask {
  integrationId: string;
}

// POST { tasks: [{ gid, integrationId, title, description?, integrationName? }] }
// Re-assess which tasks are AI-runnable. Tasks whose content hash AND the
// current prompt version match the cache are skipped (no LLM call); the rest are
// classified in one headless call. Verdicts are cached and mirrored onto each
// task's metadata.aiDelegable so the UI/badges reflect them.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const tasks: IncomingTask[] = Array.isArray(body?.tasks) ? body.tasks : [];
    if (tasks.length === 0) {
      return NextResponse.json({ error: 'tasks array is required' }, { status: 400 });
    }

    const cache = await getAllAiClassification();

    // Split into cached (unchanged) vs. needs-assessment.
    const toAssess: IncomingTask[] = [];
    for (const task of tasks) {
      const hash = contentHash(task);
      const cached = cache[task.gid];
      if (!cached || cached.contentHash !== hash || cached.promptVersion !== PROMPT_VERSION) {
        toAssess.push(task);
      }
    }

    const results = await classifyTasks(toAssess);
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
      await upsertTaskMetadata(task.gid, task.integrationId, { aiDelegable: verdict.aiSuitable });
    }

    if (Object.keys(newEntries).length > 0) {
      await saveAiClassification(newEntries);
    }

    return NextResponse.json({
      total: tasks.length,
      assessed: Object.keys(newEntries).length,
      cached: tasks.length - toAssess.length,
      changed,
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
