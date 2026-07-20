import { NextRequest, NextResponse } from 'next/server';

import { classifyBlockCategory } from '@/lib/capacity';
import { getEnabledAsanaIntegrations } from '@/lib/integration-storage';
import { gatherWeekContext } from '@/lib/scheduling/gather';
import { matchPriorities, type PriorityCandidate } from '@/lib/priority-matcher';

// POST { items: string[], weekStart?: string }
// Match each typed priority against an existing incomplete Asana task. On AI
// failure the call still succeeds with all matches null (aiUnavailable:true) so
// the wizard treats everything as create-candidates and keeps working.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const items: string[] = Array.isArray(body?.items)
      ? body.items.filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
      : [];

    const [ctx, integrations] = await Promise.all([
      gatherWeekContext(typeof body?.weekStart === 'string' ? body.weekStart : undefined),
      getEnabledAsanaIntegrations(),
    ]);

    const asanaIntegrations = integrations.map(i => ({ id: i.id, name: i.name }));
    // Every quota category is offered as a pick — including catch-alls with no
    // weeklyCount (e.g. "General Todos"), which are valid task categories even
    // though the scheduler doesn't fill quota toward them.
    const categories = ctx.quotas.map(q => q.category);

    if (items.length === 0) {
      return NextResponse.json({ results: [], asanaIntegrations, categories });
    }

    // Match against every incomplete Asana task (by gid), keeping its integration
    // + type so a matched priority carries the right category.
    const byGid = new Map(ctx.asanaCandidates.map(c => [c.task.gid, c]));
    const candidates: PriorityCandidate[] = ctx.asanaCandidates.map(c => ({
      gid: c.task.gid,
      title: c.task.name,
      dueOn: c.task.dueOn,
    }));

    let aiUnavailable = false;
    let matches;
    try {
      matches = await matchPriorities(items, candidates);
    } catch (error) {
      console.error('[Scheduling Priorities Match] classifier failed:', error);
      aiUnavailable = true;
      matches = items.map((_, index) => ({ index, gid: null }));
    }

    const gidToIndex = new Map(matches.map(m => [m.index, m.gid]));
    const results = items.map((text, index) => {
      const gid = gidToIndex.get(index) ?? null;
      const candidate = gid ? byGid.get(gid) : undefined;
      if (!gid || !candidate) return { text, match: null };
      return {
        text,
        match: {
          gid,
          title: candidate.task.name,
          integrationId: candidate.integrationId,
          category: classifyBlockCategory(candidate.typeValue ? [candidate.typeValue] : [], ctx.quotas),
        },
      };
    });

    return NextResponse.json({ results, asanaIntegrations, categories, ...(aiUnavailable ? { aiUnavailable: true } : {}) });
  } catch (error) {
    console.error('Error matching priorities:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to match priorities' },
      { status: 500 }
    );
  }
}
