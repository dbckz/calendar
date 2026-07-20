import { NextRequest, NextResponse } from 'next/server';

import { classifyBlockCategory } from '@/lib/capacity';
import { gatherWeekContext } from '@/lib/scheduling/gather';
import { taskSortKey, compareKeys } from '@/lib/scheduling/engine';
import type { CandidateTask } from '@/lib/scheduling/types';

// POST { weekStart?, priorityGids?: string[], categoryOverrides?: Record<id, category> }
// Return, per quota category, its remaining weekly quota and the ranked list of
// candidate tasks (engine ordering, with pinned priorities first). Feeds the
// wizard's manual task-selection step.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const priorityGids: string[] = Array.isArray(body?.priorityGids) ? body.priorityGids : [];
    const categoryOverrides: Record<string, string> =
      body?.categoryOverrides && typeof body.categoryOverrides === 'object' ? body.categoryOverrides : {};

    const ctx = await gatherWeekContext(typeof body?.weekStart === 'string' ? body.weekStart : undefined);
    const priorityIds = new Set(priorityGids);

    // Apply priority flags + category overrides, then bucket by category.
    const tasksByCategory = new Map<string, CandidateTask[]>();
    for (const task of ctx.candidateTasks) {
      const id = task.gid ?? task.adhocId ?? '';
      const overrideCategory = categoryOverrides[id];
      const typeSignals = overrideCategory ? [overrideCategory] : task.typeSignals;
      const category = classifyBlockCategory(typeSignals, ctx.quotas);
      if (!category) continue;
      const withFlags: CandidateTask = {
        ...task,
        typeSignals,
        isPriority: task.gid ? priorityIds.has(task.gid) : task.isPriority,
      };
      const list = tasksByCategory.get(category) ?? [];
      list.push(withFlags);
      tasksByCategory.set(category, list);
    }

    const categories = ctx.quotas
      .filter(q => (q.weeklyCount ?? 0) > 0)
      .map(q => {
        const weeklyCount = q.weeklyCount ?? 0;
        const existing = ctx.existingScheduledCounts[q.category] ?? 0;
        const list = (tasksByCategory.get(q.category) ?? []).slice();
        list.sort((a, b) => compareKeys(taskSortKey(a), taskSortKey(b)));
        return {
          category: q.category,
          remainingQuota: Math.max(0, weeklyCount - existing),
          autoSelect: ctx.config.taskQuotas[q.category]?.autoSelect === true,
          candidates: list.map(t => ({
            id: t.gid ?? t.adhocId ?? '',
            gid: t.gid,
            title: t.title,
            dueDate: t.dueDate,
            deadlineType: t.deadlineType,
            isPriority: t.isPriority === true,
          })),
        };
      });

    return NextResponse.json({ categories });
  } catch (error) {
    console.error('Error building task candidates:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to build candidates' },
      { status: 500 }
    );
  }
}
