import { NextRequest, NextResponse } from 'next/server';
import {
  classifyStale,
  staleContentHash,
  STALE_PROMPT_VERSION,
  type StaleTask,
} from '@/lib/staleness-classifier';
import { getStaleData, saveStaleClassification } from '@/lib/user-data-storage';
import { StaleClassificationEntry } from '@/types';

interface IncomingTask extends StaleTask {
  integrationId: string;
}

// Only tasks this old are even worth asking the model about; anything more recent
// is trivially not stale, so we skip it (no LLM cost).
const CANDIDATE_MIN_AGE_DAYS = 60;   // created at least this long ago
const OVERDUE_DAYS = 30;             // or overdue by at least this long
// Re-assess a cached verdict once it ages past this, since "how old is this now"
// drifts even when the task's own content hasn't changed.
const CACHE_TTL_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(iso: string | undefined, now: number): number {
  if (!iso) return -1;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? -1 : (now - t) / DAY_MS;
}

// A plausibly-old task worth asking the model about.
function isCandidate(task: IncomingTask, now: number): boolean {
  const createdDays = daysBetween(task.createdAt, now);
  const overdueDays = daysBetween(task.dueOn, now);
  return createdDays >= CANDIDATE_MIN_AGE_DAYS || overdueDays >= OVERDUE_DAYS;
}

// POST { tasks: [{ gid, integrationId, title, description?, createdAt?, dueOn?, startOn?, integrationName? }] }
// Triage which tasks look stale (deletion candidates). Skips recent tasks, tasks
// snoozed via "keep active", and tasks whose content + prompt are unchanged and
// recently assessed. Returns the current stale set (cached ∪ freshly assessed,
// minus snoozes) for the UI to render.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const tasks: IncomingTask[] = Array.isArray(body?.tasks) ? body.tasks : [];
    if (tasks.length === 0) {
      return NextResponse.json({ error: 'tasks array is required' }, { status: 400 });
    }

    const now = Date.now();
    const { staleClassification: cache, staleKeep } = await getStaleData();
    const isSnoozed = (gid: string) => {
      const until = staleKeep[gid];
      return Boolean(until && Date.parse(until) > now);
    };

    // Candidates that still need a verdict (not snoozed, not freshly cached).
    const toAssess: IncomingTask[] = [];
    for (const task of tasks) {
      if (!isCandidate(task, now) || isSnoozed(task.gid)) continue;
      const hash = staleContentHash(task);
      const cached = cache[task.gid];
      const fresh = cached
        && cached.contentHash === hash
        && cached.promptVersion === STALE_PROMPT_VERSION
        && daysBetween(cached.assessedAt, now) < CACHE_TTL_DAYS;
      if (!fresh) toAssess.push(task);
    }

    const assessedAt = new Date(now).toISOString();
    const results = await classifyStale(toAssess, assessedAt);
    const byGid = new Map(results.map(r => [r.gid, r]));

    const newEntries: Record<string, StaleClassificationEntry> = {};
    for (const task of toAssess) {
      const verdict = byGid.get(task.gid);
      if (!verdict) continue; // model omitted this one — keep any prior verdict
      newEntries[task.gid] = {
        contentHash: staleContentHash(task),
        promptVersion: STALE_PROMPT_VERSION,
        stale: verdict.stale,
        reason: verdict.reason,
        assessedAt,
      };
    }
    if (Object.keys(newEntries).length > 0) {
      await saveStaleClassification(newEntries);
    }

    // Current stale set = every input task whose (merged) verdict is stale and
    // which isn't snoozed.
    const merged = { ...cache, ...newEntries };
    const staleTasks = tasks
      .filter(t => merged[t.gid]?.stale && !isSnoozed(t.gid))
      .map(t => ({ gid: t.gid, reason: merged[t.gid].reason }));

    return NextResponse.json({
      total: tasks.length,
      assessed: Object.keys(newEntries).length,
      staleTasks,
    });
  } catch (error) {
    console.error('Error triaging stale tasks:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to triage stale tasks' },
      { status: 500 }
    );
  }
}
