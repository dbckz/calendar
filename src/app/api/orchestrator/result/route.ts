import { NextRequest, NextResponse } from 'next/server';
import { upsertDelegationEntry } from '@/lib/user-data-storage';
import { DelegationRunResult, DelegationState } from '@/types';

const VALID_STATES: DelegationState[] = ['queued', 'running', 'done', 'failed'];

// POST - Report a run result (called by the runner: pacer + "Run now" child).
// Sets the entry's terminal state and attaches the full DelegationRunResult.
// A usage-limit backoff re-queues the entry by passing state='queued'.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { asanaTaskGid, integrationId, state, result } = body as {
      asanaTaskGid?: string;
      integrationId?: string;
      state?: DelegationState;
      result?: DelegationRunResult;
    };

    if (!asanaTaskGid || typeof asanaTaskGid !== 'string') {
      return NextResponse.json({ error: 'asanaTaskGid is required' }, { status: 400 });
    }
    if (!integrationId || typeof integrationId !== 'string') {
      return NextResponse.json({ error: 'integrationId is required' }, { status: 400 });
    }
    if (!state || !VALID_STATES.includes(state)) {
      return NextResponse.json({ error: 'state must be one of queued|running|done|failed' }, { status: 400 });
    }

    const entry = await upsertDelegationEntry(asanaTaskGid, integrationId, {
      state,
      ...(result ? { result } : {}),
    });
    return NextResponse.json({ entry });
  } catch (error) {
    console.error('Error reporting delegation result:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to report delegation result' },
      { status: 500 }
    );
  }
}
