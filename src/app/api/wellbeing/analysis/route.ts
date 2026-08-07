import { NextRequest, NextResponse } from 'next/server';
import { format, subDays } from 'date-fns';

import { computeWellbeingAnalysis } from '@/lib/wellbeing-analysis';
import { getWellbeingDays } from '@/lib/storage/wellbeing';

// Long enough to show a trend and several weeks of bars, short enough that a
// habit abandoned months ago doesn't flatter the current rate.
const DEFAULT_WINDOW_DAYS = 90;

// GET /api/wellbeing/analysis?from=&to= — habit rates, streaks, weekly bars and
// the reasons behind the skips.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const to = searchParams.get('to') || format(new Date(), 'yyyy-MM-dd');
    const from =
      searchParams.get('from') || format(subDays(new Date(to), DEFAULT_WINDOW_DAYS - 1), 'yyyy-MM-dd');

    const days = await getWellbeingDays(from, to);
    return NextResponse.json({ analysis: computeWellbeingAnalysis(days, from, to) });
  } catch (error) {
    console.error('Error building wellbeing analysis:', error);
    return NextResponse.json({ error: 'Failed to build the analysis' }, { status: 500 });
  }
}
