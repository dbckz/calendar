import { NextResponse } from 'next/server';

import { getAllWeeklyStats } from '@/lib/user-data-storage';
import { summariseWeek } from '@/lib/weekly-stats';

// GET → one summary per recorded week, newest first.
//
// Read-only: the weekly-stats store is written during planning and review, so
// nothing here mutates. Past weeks are final, so the summaries are stable.
export async function GET() {
  try {
    const records = await getAllWeeklyStats();

    const weeks = Object.values(records)
      .map(summariseWeek)
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart));

    return NextResponse.json({ weeks });
  } catch (error) {
    console.error('Error building weekly analysis:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to build weekly analysis' },
      { status: 500 }
    );
  }
}
