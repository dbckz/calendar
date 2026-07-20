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

    // Include quota categories (weeklyCount > 0) plus no-quota catch-all
    // categories (e.g. "General Todos"). The latter have no weekly cap, so we
    // flag them with noQuota:true and remainingQuota:null — the UI lets the user
    // pick any number of their candidates rather than "up to N".
    const categories = ctx.quotas
      .filter(q => (q.weeklyCount ?? 0) > 0 || (tasksByCategory.get(q.category)?.length ?? 0) > 0)
      .map(q => {
        const weeklyCount = q.weeklyCount ?? 0;
        const noQuota = weeklyCount <= 0;
        // Grouped categories (e.g. Engagement / Outreach) place a fixed number of
        // blocks but let the user pick ANY number of tasks to spread across them,
        // so — like no-quota catch-alls — they surface uncapped (remainingQuota
        // null) and the wizard renders them "Pick any".
        const grouped = ctx.config.taskQuotas[q.category]?.grouped === true;
        const existing = ctx.existingScheduledCounts[q.category] ?? 0;
        const list = (tasksByCategory.get(q.category) ?? []).slice();
        list.sort((a, b) => compareKeys(taskSortKey(a), taskSortKey(b)));
        return {
          category: q.category,
          noQuota,
          grouped,
          remainingQuota: noQuota || grouped ? null : Math.max(0, weeklyCount - existing),
          autoSelect: noQuota ? false : ctx.config.taskQuotas[q.category]?.autoSelect === true,
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
