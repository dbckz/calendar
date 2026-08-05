import { NextRequest, NextResponse } from 'next/server';
import { addDays, subDays } from 'date-fns';

import { pullPlannedSessions } from '@/lib/exercise-calendar';

// How far either side of today to sync by default. Back far enough to pick up a
// plan written last week, forward far enough to cover the fortnight ahead that
// actually gets planned.
const DEFAULT_BACK_DAYS = 28;
const DEFAULT_FORWARD_DAYS = 28;

// POST /api/exercise/sync-calendar { backDays?, forwardDays? }
//
// Pulls planned sessions from the personal Google calendar's all-day events
// into the portal. Idempotent: re-running reconciles rather than duplicates.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const backDays = Number(body.backDays) || DEFAULT_BACK_DAYS;
    const forwardDays = Number(body.forwardDays) || DEFAULT_FORWARD_DAYS;

    const now = new Date();
    const result = await pullPlannedSessions(subDays(now, backDays), addDays(now, forwardDays));
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sync from the calendar';
    console.error('Error syncing exercise plan from calendar:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
