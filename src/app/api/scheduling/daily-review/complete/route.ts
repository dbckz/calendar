import { NextRequest, NextResponse } from 'next/server';

import { setDailyReviewLastReviewed, confirmReviewTitleTasks } from '@/lib/user-data-storage';
import { normalizeReviewTitleKey } from '@/lib/scheduling/not-a-task';

// Stamp the daily review as completed now. The next review then only covers
// blocks that finished after this moment (see the analyze route's review
// window). Called when the user applies the review's "what got done" step.
//
// Body (optional): { confirmedTitles?: string[] } — the bare calendar-event
// titles the user reviewed (rather than dismissed). Each is recorded as an
// implicit "this IS a task" user verdict so the not-a-task classifier learns his
// confirmations. Best-effort: a bad/empty body just skips the confirmations.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const confirmedTitles: string[] = Array.isArray(body?.confirmedTitles)
      ? body.confirmedTitles.filter((t: unknown): t is string => typeof t === 'string')
      : [];
    const now = new Date().toISOString();
    await setDailyReviewLastReviewed(now);
    if (confirmedTitles.length > 0) {
      await confirmReviewTitleTasks(confirmedTitles.map(normalizeReviewTitleKey));
    }
    return NextResponse.json({ lastReviewedAt: now });
  } catch (error) {
    console.error('Error stamping daily review complete:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to record review' },
      { status: 500 }
    );
  }
}
