import { NextResponse } from 'next/server';
import { addDays, format, startOfWeek } from 'date-fns';

import { getWorkflowConfig } from '@/lib/workflow-config-storage';
import {
  getScheduledAsanaTasks,
  getAdHocTasks,
  getPrepBlocks,
  getRitualBlocks,
  getDailyReviewState,
} from '@/lib/user-data-storage';
import { logicalTodayDate, normalizeRolloverHour } from '@/lib/date-utils';
import { isEndOfWeekReview } from '@/lib/scheduling/end-of-week';
import {
  deriveWeekAction,
  isEndOfWeekReviewDone,
  type WeekAction,
} from '@/lib/scheduling/week-state';

// GET → what the dashboard's single adaptive planning button should do.
//
// Deliberately CHEAP: local stores + config only, no Google or Asana round
// trips, so the dashboard can call it on every load. "Planned" is judged from
// the plan artefacts the wizard writes (scheduled Asana blocks, placed ad-hoc
// tasks, prep blocks, ritual blocks) rather than a separate flag, so a plan made
// before this endpoint existed still counts.
export async function GET() {
  try {
    const now = new Date();
    const config = await getWorkflowConfig();
    const rolloverHour = normalizeRolloverHour(config.scheduling?.dayRolloverHour);
    const logicalToday = logicalTodayDate(now, rolloverHour);

    const weekStart = startOfWeek(logicalToday, { weekStartsOn: 1 });
    const nextWeekStart = addDays(weekStart, 7);
    const weekStartStr = format(weekStart, 'yyyy-MM-dd');
    const weekEndStr = format(addDays(weekStart, 6), 'yyyy-MM-dd');
    const nextWeekStartStr = format(nextWeekStart, 'yyyy-MM-dd');
    const nextWeekEndStr = format(addDays(nextWeekStart, 6), 'yyyy-MM-dd');

    const [scheduledAsana, adHocTasks, prepBlocks, ritualBlocks, reviewState] = await Promise.all([
      getScheduledAsanaTasks(),
      getAdHocTasks(),
      getPrepBlocks(),
      getRitualBlocks(),
      getDailyReviewState(),
    ]);

    // Every app-created block, as (date, start, durationMinutes). One list so
    // "is this week planned" and "is there anything to review" agree.
    const blocks = [
      ...scheduledAsana
        .filter(s => !!s.googleEventId)
        .map(s => ({ date: s.scheduledDate, start: s.scheduledTime, duration: s.duration })),
      ...adHocTasks
        .filter(t => !!t.googleEventId && !!t.dueDate && !!t.dueTime)
        .map(t => ({ date: t.dueDate!, start: t.dueTime!, duration: t.duration ?? 30 })),
      ...prepBlocks.map(p => ({ date: p.date, start: p.start, duration: p.durationMinutes })),
      ...ritualBlocks.map(r => ({ date: r.date, start: r.start, duration: r.durationMinutes })),
    ];

    const inRange = (date: string, from: string, to: string) => date >= from && date <= to;
    const currentWeekBlocks = blocks.filter(b => inRange(b.date, weekStartStr, weekEndStr));
    const currentWeekPlanned = currentWeekBlocks.length > 0;
    const nextWeekPlanned = blocks.some(b => inRange(b.date, nextWeekStartStr, nextWeekEndStr));

    // Anything to wrap up? A block this week that has already ended. A week that
    // was never planned has nothing to review, so the wrap-up gate is skipped.
    const nowMs = now.getTime();
    const hasReviewableBlocks = currentWeekBlocks.some(b => {
      const [y, mo, d] = b.date.split('-').map(Number);
      const [h, mi] = (b.start ?? '00:00').split(':').map(Number);
      const endMs = new Date(y, mo - 1, d, h, mi, 0, 0).getTime() + (b.duration ?? 30) * 60_000;
      return endMs <= nowMs;
    });

    const endOfWeek = isEndOfWeekReview(logicalToday, config.scheduling?.workingDays);
    const endOfWeekReviewDone = isEndOfWeekReviewDone(
      reviewState.lastReviewedAt || undefined,
      weekStart,
      config.scheduling?.workingDays
    );

    const action: WeekAction = deriveWeekAction({
      currentWeekPlanned,
      endOfWeek,
      endOfWeekReviewDone,
      nextWeekPlanned,
      hasReviewableBlocks,
    });

    return NextResponse.json({
      action,
      weekStart: weekStartStr,
      nextWeekStart: nextWeekStartStr,
      currentWeekPlanned,
      nextWeekPlanned,
      endOfWeek,
      endOfWeekReviewDone,
      hasReviewableBlocks,
      workingDays: config.scheduling?.workingDays,
    });
  } catch (error) {
    console.error('Error deriving week state:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to derive week state' },
      { status: 500 }
    );
  }
}
