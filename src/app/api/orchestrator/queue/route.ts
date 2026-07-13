import { NextRequest, NextResponse } from 'next/server';
import {
  getAllDelegationEntries,
  upsertDelegationEntry,
  deleteDelegationEntry,
} from '@/lib/user-data-storage';

// GET - Fetch the whole delegation queue (keyed by Asana task GID)
export async function GET() {
  try {
    const entries = await getAllDelegationEntries();
    return NextResponse.json({ entries });
  } catch (error) {
    console.error('Error fetching delegation queue:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch delegation queue' },
      { status: 500 }
    );
  }
}

// PUT - Upsert a single queue entry by GID (enqueue or edit a brief)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { asanaTaskGid, integrationId, ...updates } = body;

    if (!asanaTaskGid || typeof asanaTaskGid !== 'string') {
      return NextResponse.json({ error: 'asanaTaskGid is required' }, { status: 400 });
    }
    if (!integrationId || typeof integrationId !== 'string') {
      return NextResponse.json({ error: 'integrationId is required' }, { status: 400 });
    }

    const entry = await upsertDelegationEntry(asanaTaskGid, integrationId, updates);
    return NextResponse.json({ entry });
  } catch (error) {
    console.error('Error saving delegation entry:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save delegation entry' },
      { status: 500 }
    );
  }
}

// DELETE - Remove a queue entry by GID
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const asanaTaskGid = searchParams.get('asanaTaskGid');

    if (!asanaTaskGid) {
      return NextResponse.json({ error: 'asanaTaskGid is required' }, { status: 400 });
    }

    const removed = await deleteDelegationEntry(asanaTaskGid);
    if (!removed) {
      return NextResponse.json({ error: 'Delegation entry not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting delegation entry:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete delegation entry' },
      { status: 500 }
    );
  }
}
