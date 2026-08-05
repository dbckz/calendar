import { NextRequest, NextResponse } from 'next/server';

import { resolveEvidenceForGoals } from '@/lib/goal-evidence';
import { computeProgress } from '@/lib/goal-progress';
import { createGoal, queryGoals } from '@/lib/storage/goals';
import type { GoalPeriodKind, GoalStatus, GoalWithProgress } from '@/types/life';

// GET /api/goals?sectionId=&periodKind=&periodKey=&status=&withProgress=1
//
// withProgress resolves each goal's evidence source (Asana, calendar
// categories, the exercise log) and computes pacing. That costs network calls
// for Asana-backed goals, so it is opt-in: the goal pickers in the planning
// wizard ask for the bare list.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const goals = await queryGoals({
      sectionId: searchParams.get('sectionId') ?? undefined,
      periodKind: (searchParams.get('periodKind') as GoalPeriodKind | null) ?? undefined,
      periodKey: searchParams.get('periodKey') ?? undefined,
      status: (searchParams.get('status') as GoalStatus | null) ?? undefined,
    });

    if (searchParams.get('withProgress') !== '1') {
      return NextResponse.json({ goals });
    }

    const evidence = await resolveEvidenceForGoals(goals);
    const items: GoalWithProgress[] = goals.map(goal => ({
      goal,
      progress: computeProgress(goal, evidence[goal.id]),
    }));
    return NextResponse.json({ goals, items });
  } catch (error) {
    console.error('Error listing goals:', error);
    return NextResponse.json({ error: 'Failed to list goals' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const goal = await createGoal({
      sectionId: body.sectionId,
      periodKind: body.periodKind,
      periodKey: body.periodKey,
      title: body.title ?? '',
      detail: body.detail,
      parentGoalId: body.parentGoalId || undefined,
      target: body.target,
      evidence: body.evidence,
    });
    return NextResponse.json({ goal });
  } catch (error) {
    // Validation failures (unknown section, bad period key, invalid parent) are
    // the caller's fault and carry an actionable message.
    const message = error instanceof Error ? error.message : 'Failed to create goal';
    console.error('Error creating goal:', error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
