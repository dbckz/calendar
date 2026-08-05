import { NextRequest, NextResponse } from 'next/server';

import { resolveEvidenceForGoals } from '@/lib/goal-evidence';
import { buildScorecard, computeProgress } from '@/lib/goal-progress';
import { isValidPeriodKey, periodKeyFor, previousPeriodKey } from '@/lib/goal-periods';
import { queryGoals } from '@/lib/storage/goals';
import type { GoalPeriodKind, GoalWithProgress } from '@/types/life';

// GET /api/goals/scorecard?periodKind=month|quarter&periodKey=&sectionId=
//
// The end-of-period summary that seeds a reflection session: every goal in the
// period with a hit/partial/missed verdict derived from its evidence. Omitting
// periodKey defaults to the period just gone, which is what a reflection almost
// always wants.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const periodKind = (searchParams.get('periodKind') as GoalPeriodKind) || 'month';
    if (periodKind !== 'month' && periodKind !== 'quarter') {
      return NextResponse.json({ error: 'periodKind must be month or quarter' }, { status: 400 });
    }

    const periodKey =
      searchParams.get('periodKey') || previousPeriodKey(periodKind, periodKeyFor(periodKind, new Date()));
    if (!isValidPeriodKey(periodKind, periodKey)) {
      return NextResponse.json({ error: `Invalid ${periodKind} key: ${periodKey}` }, { status: 400 });
    }

    const goals = await queryGoals({
      periodKind,
      periodKey,
      sectionId: searchParams.get('sectionId') ?? undefined,
    });
    const evidence = await resolveEvidenceForGoals(goals);
    const items: GoalWithProgress[] = goals.map(goal => ({
      goal,
      progress: computeProgress(goal, evidence[goal.id]),
    }));

    return NextResponse.json({ scorecard: buildScorecard(periodKind, periodKey, items) });
  } catch (error) {
    console.error('Error building scorecard:', error);
    return NextResponse.json({ error: 'Failed to build scorecard' }, { status: 500 });
  }
}
