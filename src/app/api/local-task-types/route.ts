import { NextRequest, NextResponse } from 'next/server';

import { getLocalTaskTypes, setLocalTaskTypes } from '@/lib/local-task-types';

// GET → the full { taskGid: Type label } map.
export async function GET() {
  const types = await getLocalTaskTypes();
  return NextResponse.json({ types });
}

// PUT { updates: { [taskGid]: label | null } } → merge into the store (null
// deletes) and return the merged map.
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const updates = body?.updates;
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      return NextResponse.json(
        { error: 'Invalid body. Expected { updates: Record<taskGid, string | null> }.' },
        { status: 400 }
      );
    }
    const types = await setLocalTaskTypes(updates as Record<string, string | null>);
    return NextResponse.json({ types });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }
}
