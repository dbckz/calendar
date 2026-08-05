import { NextRequest, NextResponse } from 'next/server';

import { addCheckIn } from '@/lib/storage/goals';
import type { GoalCheckInStatus } from '@/types/life';

const STATUSES: GoalCheckInStatus[] = ['on-track', 'slipping', 'stalled'];
const SOURCES = ['weekly-review', 'goals-tab', 'reflection'] as const;

// POST /api/goals/:id/check-in — a one-line status update. Written by the
// weekly review's goal step, the Goals tab, and reflection sessions; the source
// is recorded so the weekly ritual's check-ins can be told apart later.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: `status must be one of: ${STATUSES.join(', ')}` },
        { status: 400 }
      );
    }
    const source = SOURCES.includes(body.source) ? body.source : 'goals-tab';

    const goal = await addCheckIn(id, {
      status: body.status,
      source,
      note: body.note,
      value: typeof body.value === 'number' ? body.value : undefined,
    });
    if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    return NextResponse.json({ goal });
  } catch (error) {
    console.error('Error recording goal check-in:', error);
    return NextResponse.json({ error: 'Failed to record check-in' }, { status: 500 });
  }
}
