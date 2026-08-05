import { NextRequest, NextResponse } from 'next/server';
import { format, subDays } from 'date-fns';

import { analyseExercise } from '@/lib/exercise-analysis';
import { getAllSessions } from '@/lib/storage/exercise';

// Twelve weeks: long enough for a weekly trend to mean something, short enough
// that a change of routine three months ago doesn't drown out this month.
const DEFAULT_WINDOW_DAYS = 84;

// GET /api/exercise/analysis?from=&to= — volume, adherence, streaks and the
// rule-based suggestions for the window.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const to = searchParams.get('to') || format(new Date(), 'yyyy-MM-dd');
    const from = searchParams.get('from') || format(subDays(new Date(to), DEFAULT_WINDOW_DAYS - 1), 'yyyy-MM-dd');

    const analysis = analyseExercise(await getAllSessions(), from, to);
    return NextResponse.json({ analysis });
  } catch (error) {
    console.error('Error analysing exercise log:', error);
    return NextResponse.json({ error: 'Failed to analyse exercise log' }, { status: 500 });
  }
}
