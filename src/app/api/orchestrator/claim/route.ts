import { NextResponse } from 'next/server';
import { claimNextDelegationEntry } from '@/lib/user-data-storage';

// POST - Claim the next queued delegation entry (called by the pacer worker).
// Atomically marks the highest-priority/oldest queued entry as running and
// returns it, or { entry: null } when the queue is empty.
export async function POST() {
  try {
    const entry = await claimNextDelegationEntry();
    return NextResponse.json({ entry });
  } catch (error) {
    console.error('Error claiming delegation entry:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to claim delegation entry' },
      { status: 500 }
    );
  }
}
