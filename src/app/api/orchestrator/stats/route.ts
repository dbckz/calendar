import { NextResponse } from 'next/server';

import { readDelegationStats } from '@/lib/delegation-stats';

// GET /api/orchestrator/stats — success rate, typical turnaround and cost per
// run, computed from the per-run JSONL traces the orchestrator already writes.
export async function GET() {
  try {
    return NextResponse.json({ stats: readDelegationStats() });
  } catch (error) {
    console.error('Error reading delegation stats:', error);
    return NextResponse.json({ error: 'Failed to read delegation stats' }, { status: 500 });
  }
}
