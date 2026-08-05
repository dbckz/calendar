import { NextResponse } from 'next/server';

import { buildProgressions } from '@/lib/exercise-progression';
import { getAllSessions } from '@/lib/storage/exercise';

// GET /api/exercise/progression — every logged exercise with its history, most
// -trained first. Built from the whole log rather than a window: a lift trained
// monthly still deserves its progression.
export async function GET() {
  try {
    const progressions = buildProgressions(await getAllSessions());
    return NextResponse.json({ progressions });
  } catch (error) {
    console.error('Error building exercise progressions:', error);
    return NextResponse.json({ error: 'Failed to build progressions' }, { status: 500 });
  }
}
