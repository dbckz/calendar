import { NextRequest, NextResponse } from 'next/server';

import { classifyBlockCategoryWithCatchAll } from '@/lib/capacity';
import { gatherWeekContext } from '@/lib/scheduling/gather';
import { proposeBlocks, localDateStr, computeSpareCapacity, resolveWorkingWindow } from '@/lib/scheduling/engine';
import {
  placeWeekRituals,
  proposedBlockToBusyInterval,
  EXERCISE_TITLE,
} from '@/lib/scheduling/rituals';
import type { CandidateTask, ProposedBlock } from '@/lib/scheduling/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const selections: Record<string, string[]> | undefined =
      body?.selections && typeof body.selections === 'object' ? body.selections : undefined;
    const priorityGids: string[] = Array.isArray(body?.priorityGids) ? body.priorityGids : [];
    // Task ids (gid or adhocId) flagged "must do this week" in the wizard. Marked
    // isPriority so they sort first within their category (taskSortKey) and are
    // never dropped by a selection cap.
    const mustDoIds: string[] = Array.isArray(body?.mustDoIds) ? body.mustDoIds : [];
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

    // Daily lunch/exercise/emails rituals are placed FIRST (before task
    // allocation), around the calendar's existing busy time + any accepted prep
    // blocks, so tasks flow around them. A day that already has a ritual event
    // ("🍽️ Lunch" / "🏋️ Exercise" / "📧 Emails") is skipped for that ritual
    // (dedupe by exact title from the week's events). The prep-candidates route
    // places rituals with the SAME helper + inputs BEFORE proposing prep, so prep
    // never steals the exercise slot; the accepted prep it hands back here never
    // overlaps the ritual slots, so this pass re-derives identical placements.
    const prepIntervals = prepBlocks.map(proposedBlockToBusyInterval);
    const ritualBlocks = placeWeekRituals({
      config: ctx.config,
      weekEvents: ctx.weekEvents,
      busyIntervals: [...ctx.busyIntervals, ...prepIntervals],
      weekStart: ctx.weekStart,
      now: ctx.now,
    });

    // Accepted prep + placed ritual blocks occupy time before task placement
    // (lunch/exercise tagged as breaks, so they split work runs).
    const busyIntervals = [
      ...ctx.busyIntervals,
      ...prepIntervals,
      ...ritualBlocks.map(proposedBlockToBusyInterval),
    ];

    const priorityIds = new Set(priorityGids);
    const mustDoSet = new Set(mustDoIds);
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
        isPriority:
          mustDoSet.has(id) || (task.gid ? priorityIds.has(task.gid) : task.isPriority),
      };

      if (selectionSets) {
        const category = classifyBlockCategoryWithCatchAll(typeSignals, ctx.quotas);
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
    const spareBusyMs = [...busyIntervals, ...taskBlocks.map(proposedBlockToBusyInterval)].map(i => ({
      start: i.start.getTime(),
      end: i.end.getTime(),
      isBreak: i.isBreak,
    }));
    const spareCapacity = computeSpareCapacity(workingDays, spareBusyMs, workRun, ctx.now.getTime());

    // --- Unmet-quota summary (task categories only; prep isn't a quota) ---
    // Optional evening-overflow blocks are default-rejected, so they don't count
    // toward a category's met quota (a category short on working-hours time still
    // reads as unmet even if overflow blocks were offered).
    const proposedByCategory: Record<string, number> = {};
    for (const p of taskBlocks) {
      if (p.overflow) continue;
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

    // --- Exercise coverage (priority-one ritual) ---
    // Working days with no exercise placement in the final proposals OR an
    // existing calendar exercise event. Surfaced so the review step can warn when
    // exercise couldn't be scheduled on a day (no free hour).
    const daysWithExercise = new Set<string>();
    for (const b of ritualBlocks) if (b.title === EXERCISE_TITLE) daysWithExercise.add(b.date);
    for (const e of ctx.weekEvents) {
      if (!e.allDay && e.title?.trim() === EXERCISE_TITLE) daysWithExercise.add(localDateStr(e.startTime));
    }
    const exerciseMissingDays = workingDays
      .map(d => d.dateStr)
      .filter(dateStr => !daysWithExercise.has(dateStr));

    return NextResponse.json({
      weekStart: ctx.weekStartStr,
      weekEnd: ctx.weekEndStr,
      proposals,
      quotaSummary,
      spareCapacity,
      exerciseMissingDays,
    });
  } catch (error) {
    console.error('Error proposing weekly plan:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to propose plan' },
      { status: 500 }
    );
  }
}
