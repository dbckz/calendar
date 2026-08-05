import { NextResponse } from 'next/server';

import { resolveEvidenceForGoals } from '@/lib/goal-evidence';
import { buildNudges, computeProgress } from '@/lib/goal-progress';
import { periodKeyFor } from '@/lib/goal-periods';
import { queryGoals } from '@/lib/storage/goals';
import type { GoalWithProgress } from '@/types/life';

// GET /api/goals/nudges — active goals in the CURRENT month or quarter that are
// past halfway with nothing to show, behind pace, or self-reported stalled.
// Feeds the Command Center nudge card, so it stays quiet by design: an empty
// list is the normal state early in a period.
export async function GET() {
  try {
    const now = new Date();
    const goals = [
      ...(await queryGoals({ periodKind: 'month', periodKey: periodKeyFor('month', now), status: 'active' })),
      ...(await queryGoals({ periodKind: 'quarter', periodKey: periodKeyFor('quarter', now), status: 'active' })),
    ];

    const evidence = await resolveEvidenceForGoals(goals);
    const items: GoalWithProgress[] = goals.map(goal => ({
      goal,
      progress: computeProgress(goal, evidence[goal.id], now),
    }));

    return NextResponse.json({ nudges: buildNudges(items) });
  } catch (error) {
    console.error('Error building goal nudges:', error);
    // The nudge card is advisory; a failure must not break the dashboard.
    return NextResponse.json({ nudges: [] });
  }
}
