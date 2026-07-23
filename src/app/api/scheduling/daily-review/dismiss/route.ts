import { NextRequest, NextResponse } from 'next/server';

import { addDismissedReviewTitle } from '@/lib/user-data-storage';

// Dismiss a bare calendar-event title as "not a task" so it never resurfaces in
// the daily review. Idempotent.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const title = typeof body?.title === 'string' ? body.title : '';
    if (!title.trim()) {
      return NextResponse.json({ error: 'A title is required' }, { status: 400 });
    }
    await addDismissedReviewTitle(title);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error dismissing review title:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to dismiss title' },
      { status: 500 }
    );
  }
}
