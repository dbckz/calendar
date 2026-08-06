import { NextRequest, NextResponse } from 'next/server';
import { format, subDays } from 'date-fns';

import { analyseExercise } from '@/lib/exercise-analysis';
import { getAllSessions } from '@/lib/storage/exercise';

// The fallback window when nothing has been logged yet: twelve weeks, long
// enough for a weekly trend to mean something. Once there's history the window
// runs from the first completed session instead, so the averages reflect the
// real training span rather than a stretch that starts before any data exists.
const DEFAULT_WINDOW_DAYS = 84;

// GET /api/exercise/analysis?from=&to= — volume, adherence, streaks and the
// rule-based suggestions for the window.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessions = await getAllSessions();
    const to = searchParams.get('to') || format(new Date(), 'yyyy-MM-dd');
    // getAllSessions() is date-ascending, so the first completed session is the
    // earliest one — the natural start of the training record.
    const firstCompleted = sessions.find(s => s.completed)?.date;
    const from =
      searchParams.get('from') ||
      firstCompleted ||
      format(subDays(new Date(to), DEFAULT_WINDOW_DAYS - 1), 'yyyy-MM-dd');

    const analysis = analyseExercise(sessions, from, to);
    return NextResponse.json({ analysis });
  } catch (error) {
    console.error('Error analysing exercise log:', error);
    return NextResponse.json({ error: 'Failed to analyse exercise log' }, { status: 500 });
  }
}
