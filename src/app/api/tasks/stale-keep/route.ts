import { NextRequest, NextResponse } from 'next/server';
import { setStaleKeep } from '@/lib/user-data-storage';

const DEFAULT_KEEP_DAYS = 90;

// POST { asanaTaskGid, days? } — mark a task "keep active": snooze it out of the
// stale list for `days` (default 90), so triage remembers the choice.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const asanaTaskGid: unknown = body?.asanaTaskGid;
    const days = Number.isFinite(body?.days) && body.days > 0 ? Number(body.days) : DEFAULT_KEEP_DAYS;

    if (!asanaTaskGid || typeof asanaTaskGid !== 'string') {
      return NextResponse.json({ error: 'asanaTaskGid is required' }, { status: 400 });
    }

    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    await setStaleKeep(asanaTaskGid, until);
    return NextResponse.json({ success: true, keptUntil: until });
  } catch (error) {
    console.error('Error marking task active:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to mark task active' },
      { status: 500 }
    );
  }
}
