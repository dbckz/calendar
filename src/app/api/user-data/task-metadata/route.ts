import { NextRequest, NextResponse } from 'next/server';
import { getAllTaskMetadata, upsertTaskMetadata } from '@/lib/user-data-storage';

// GET - Fetch all task metadata (keyed by Asana task GID)
export async function GET() {
  try {
    const metadata = await getAllTaskMetadata();
    return NextResponse.json({ metadata });
  } catch (error) {
    console.error('Error fetching task metadata:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch task metadata' },
      { status: 500 }
    );
  }
}

// PUT - Upsert metadata for a single task by GID
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

    const metadata = await upsertTaskMetadata(asanaTaskGid, integrationId, updates);
    return NextResponse.json({ metadata });
  } catch (error) {
    console.error('Error saving task metadata:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save task metadata' },
      { status: 500 }
    );
  }
}
