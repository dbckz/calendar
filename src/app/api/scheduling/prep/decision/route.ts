import { NextRequest, NextResponse } from 'next/server';

import { normalizePrepKey } from '@/lib/prep-classifier';
import { setMeetingPrepDecision } from '@/lib/user-data-storage';

// POST { title: string, needsPrep: boolean }
// Persist an explicit user decision for a meeting title. User decisions are
// permanent and never overwritten by the AI classifier. The client re-fetches
// prep candidates afterwards so placement is recomputed.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body?.title !== 'string' || typeof body?.needsPrep !== 'boolean') {
      return NextResponse.json({ error: 'title (string) and needsPrep (boolean) are required' }, { status: 400 });
    }

    const key = normalizePrepKey(body.title);
    await setMeetingPrepDecision(key, {
      needsPrep: body.needsPrep,
      decidedBy: 'user',
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error saving prep decision:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save prep decision' },
      { status: 500 }
    );
  }
}
