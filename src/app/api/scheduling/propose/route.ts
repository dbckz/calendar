import { NextRequest, NextResponse } from 'next/server';

import { classifyBlockCategory } from '@/lib/capacity';
import { gatherWeekContext } from '@/lib/scheduling/gather';
import { proposeBlocks, localDateStr, computeSpareCapacity, resolveWorkingWindow } from '@/lib/scheduling/engine';
import {
  proposeRitualBlocks,
  LUNCH_TITLE,
  EMAILS_TITLE,
  isLunchTitle,
} from '@/lib/scheduling/rituals';
import type { BusyInterval, CandidateTask, ProposedBlock } from '@/lib/scheduling/types';

// Convert a proposed block's date + HH:mm + duration into a busy interval so the
// engine treats accepted prep/ritual blocks as occupied time. A lunch ritual is
// tagged as a break (splits work runs); everything else counts as work.
function blockToInterval(block: ProposedBlock): BusyInterval {
  const [y, mo, d] = block.date.split('-').map(Number);
  const [h, m] = block.start.split(':').map(Number);
  const start = new Date(y, mo - 1, d, h, m, 0, 0);
  const end = new Date(start.getTime() + block.durationMinutes * 60 * 1000);
  const isBreak = block.kind === 'ritual' && !!block.title && isLunchTitle(block.title);
  return { start, end, ...(isBreak ? { isBreak: true } : {}) };
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

    // Per-week block-length overrides (minutes). `durationOverrides` is keyed by
    // category (now used only for grouped categories, whose blocks are shared
    // containers); `taskDurationOverrides` is keyed by task id (gid/adhocId) for
    // single-task blocks. Keep only positive finite numbers, round to int, cap at
    // 480 (8h). Neither modifies the saved workflow config.
    const sanitizeDurations = (raw: unknown): Record<string, number> => {
      const out: Record<string, number> = {};
      if (raw && typeof raw === 'object') {
        for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
          const n = Number(value);
          if (Number.isFinite(n) && n > 0) out[key] = Math.min(480, Math.round(n));
        }
      }
      return out;
    };
    const durationOverrides = sanitizeDurations(body?.durationOverrides);
    const taskDurationOverrides = sanitizeDurations(body?.taskDurationOverrides);

    const ctx = await gatherWeekContext(typeof body?.weekStart === 'string' ? body.weekStart : undefined);

    // Daily lunch/emails rituals are placed FIRST (before task allocation), around
    // the calendar's existing busy time + any accepted prep blocks, so tasks flow
    // around them. A day that already has a "🍽️ Lunch"/"📧 Emails" event is skipped
    // (dedupe by exact title from the week's events).
    const existingRitualTitlesByDate: Record<string, Set<string>> = {};
    for (const e of ctx.weekEvents) {
      if (e.allDay) continue;
      const title = e.title?.trim();
      if (title !== LUNCH_TITLE && title !== EMAILS_TITLE) continue;
      const dateStr = localDateStr(e.startTime);
      (existingRitualTitlesByDate[dateStr] ??= new Set()).add(title);
    }

    // Prep blocks occupy time before rituals + tasks (as busy work intervals).
    const prepIntervals = prepBlocks.map(blockToInterval);
    const ritualBlocks = proposeRitualBlocks({
      config: ctx.config,
      busyIntervals: [...ctx.busyIntervals, ...prepIntervals],
      weekStart: ctx.weekStart,
      now: ctx.now,
      existingRitualTitlesByDate,
    });

    // Accepted prep + placed ritual blocks occupy time before task placement
    // (lunch tagged as a break by blockToInterval, so it splits work runs).
    const busyIntervals = [
      ...ctx.busyIntervals,
      ...prepIntervals,
      ...ritualBlocks.map(blockToInterval),
    ];

    const priorityIds = new Set(priorityGids);
    const autoSelectByCategory = new Map(
      Object.entries(ctx.config.taskQuotas).map(([category, quota]) => [category, quota.autoSelect === true])
    );
    const selectionSets = selections
      ? new Map(Object.entries(selections).map(([cat, ids]) => [cat, new Set(ids)]))
      : null;

    // Apply priority flags + category overrides, then (when the caller supplied
    // selections) drop candidates the user did not pick for manual categories.
    // Count the surviving manual picks per category so the engine can honour
    // explicit over-quota selection (place a block per pick, not just up to quota).
    const candidateTasks: CandidateTask[] = [];
    const selectedCountsByCategory: Record<string, number> = {};
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
          selectedCountsByCategory[category] = (selectedCountsByCategory[category] ?? 0) + 1;
        }
      }

      candidateTasks.push(withFlags);
    }

    const taskBlocks = proposeBlocks({
      config: ctx.config,
      busyIntervals,
      candidateTasks,
      existingScheduledCounts: ctx.existingScheduledCounts,
      existingCategoryCountsByDate: ctx.existingCategoryCountsByDate,
      durationOverridesByCategory: Object.keys(durationOverrides).length ? durationOverrides : undefined,
      durationOverridesByTask: Object.keys(taskDurationOverrides).length ? taskDurationOverrides : undefined,
      selectedCountsByCategory: selectionSets ? selectedCountsByCategory : undefined,
      weekStart: ctx.weekStart,
      now: ctx.now,
    });

    // Prep + ritual blocks are shown first, ahead of the task/reserved blocks.
    const proposals = [...prepBlocks, ...ritualBlocks, ...taskBlocks];

    // --- Spare-capacity assessment (computed AFTER all proposals) ---
    // Busy = calendar busy + accepted prep + placed rituals (already in
    // busyIntervals) + every proposed task/reserved block. Measure the usable
    // free work time left in the remaining week under the same working-window and
    // work-run model the engine used.
    const { workRun, workingDays } = resolveWorkingWindow(ctx.config.scheduling, ctx.weekStart, ctx.now);
    const spareBusyMs = [...busyIntervals, ...taskBlocks.map(blockToInterval)].map(i => ({
      start: i.start.getTime(),
      end: i.end.getTime(),
      isBreak: i.isBreak,
    }));
    const spareCapacity = computeSpareCapacity(workingDays, spareBusyMs, workRun, ctx.now.getTime());

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
      spareCapacity,
    });
  } catch (error) {
    console.error('Error proposing weekly plan:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to propose plan' },
      { status: 500 }
    );
  }
}
