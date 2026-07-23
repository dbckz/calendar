import { NextResponse } from 'next/server';

import { setDailyReviewLastReviewed } from '@/lib/user-data-storage';

// Stamp the daily review as completed now. The next review then only covers
// blocks that finished after this moment (see the analyze route's review
// window). Called when the user applies the review's "what got done" step.
export async function POST() {
  try {
    const now = new Date().toISOString();
    await setDailyReviewLastReviewed(now);
    return NextResponse.json({ lastReviewedAt: now });
  } catch (error) {
    console.error('Error stamping daily review complete:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to record review' },
      { status: 500 }
    );
  }
}
