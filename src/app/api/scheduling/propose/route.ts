import { NextRequest, NextResponse } from 'next/server';

import { classifyBlockCategory } from '@/lib/capacity';
import { gatherWeekContext } from '@/lib/scheduling/gather';
import { proposeBlocks } from '@/lib/scheduling/engine';
import type { BusyInterval, CandidateTask, ProposedBlock } from '@/lib/scheduling/types';

// Convert a proposed block's date + HH:mm + duration into a busy interval so the
// engine treats accepted prep blocks as occupied time.
function blockToInterval(block: ProposedBlock): BusyInterval {
  const [y, mo, d] = block.date.split('-').map(Number);
  const [h, m] = block.start.split(':').map(Number);
  const start = new Date(y, mo - 1, d, h, m, 0, 0);
  const end = new Date(start.getTime() + block.durationMinutes * 60 * 1000);
  return { start, end };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const selections: Record<string, string[]> | undefined =
      body?.selections && typeof body.selections === 'object' ? body.selections : undefined;
    const priorityGids: string[] = Array.isArray(body?.priorityGids) ? body.priorityGids : [];
    const categoryOverrides: Record<string, string> =
      body?.categoryOverrides && typeof body.categoryOverrides === 'object' ? body.categoryOverrides : {};
    const prepBlocks: ProposedBlock[] = Array.isArray(body?.prepBlocks) ? body.prepBlocks : [];

    const ctx = await gatherWeekContext(typeof body?.weekStart === 'string' ? body.weekStart : undefined);

    // Accepted prep blocks occupy time before task placement: join busy + counts.
    const busyIntervals = [...ctx.busyIntervals, ...prepBlocks.map(blockToInterval)];
    const existingBlocksByDate = { ...ctx.existingBlocksByDate };
    for (const block of prepBlocks) {
      existingBlocksByDate[block.date] = (existingBlocksByDate[block.date] ?? 0) + 1;
    }

    const priorityIds = new Set(priorityGids);
    const autoSelectByCategory = new Map(
      Object.entries(ctx.config.taskQuotas).map(([category, quota]) => [category, quota.autoSelect === true])
    );
    const selectionSets = selections
      ? new Map(Object.entries(selections).map(([cat, ids]) => [cat, new Set(ids)]))
      : null;

    // Apply priority flags + category overrides, then (when the caller supplied
    // selections) drop candidates the user did not pick for manual categories.
    const candidateTasks: CandidateTask[] = [];
    for (const task of ctx.candidateTasks) {
      const id = task.gid ?? task.adhocId ?? '';
      const overrideCategory = categoryOverrides[id];
      const typeSignals = overrideCategory ? [overrideCategory] : task.typeSignals;
      const withFlags: CandidateTask = {
        ...task,
        typeSignals,
        isPriority: task.gid ? priorityIds.has(task.gid) : task.isPriority,
      };

      if (selectionSets) {
        const category = classifyBlockCategory(typeSignals, ctx.quotas);
        if (category && !autoSelectByCategory.get(category)) {
          const picked = selectionSets.get(category);
          // Manual category the user didn't pick for at all → no candidates
          // (its quota fills as Reserved time). Picked category → only its ids.
          if (!picked || !picked.has(id)) continue;
        }
      }

      candidateTasks.push(withFlags);
    }

    const taskBlocks = proposeBlocks({
      config: ctx.config,
      busyIntervals,
      candidateTasks,
      existingScheduledCounts: ctx.existingScheduledCounts,
      existingBlocksByDate,
      existingCategoryCountsByDate: ctx.existingCategoryCountsByDate,
      weekStart: ctx.weekStart,
      now: ctx.now,
    });

    // Prep blocks are shown first, ahead of the task/reserved blocks.
    const proposals = [...prepBlocks, ...taskBlocks];

    // --- Unmet-quota summary (task categories only; prep isn't a quota) ---
    const proposedByCategory: Record<string, number> = {};
    for (const p of taskBlocks) {
      proposedByCategory[p.category] = (proposedByCategory[p.category] ?? 0) + 1;
    }
    const quotaSummary = ctx.quotas
      .filter(q => (q.weeklyCount ?? 0) > 0)
      .map(q => {
        const weeklyCount = q.weeklyCount ?? 0;
        const existing = ctx.existingScheduledCounts[q.category] ?? 0;
        const proposed = proposedByCategory[q.category] ?? 0;
        return {
          category: q.category,
          weeklyCount,
          existing,
          proposed,
          unmet: Math.max(0, weeklyCount - existing - proposed),
        };
      });

    return NextResponse.json({
      weekStart: ctx.weekStartStr,
      weekEnd: ctx.weekEndStr,
      proposals,
      quotaSummary,
    });
  } catch (error) {
    console.error('Error proposing weekly plan:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to propose plan' },
      { status: 500 }
    );
  }
}
