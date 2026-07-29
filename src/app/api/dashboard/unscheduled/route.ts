import { NextResponse } from 'next/server';
import { format, startOfWeek } from 'date-fns';

import { getWeeklyStats, getCarryOvers } from '@/lib/user-data-storage';
import { unscheduledThisWeek } from '@/lib/weekly-stats';

// Read-only: the tasks planned into THIS week that then slid out of the schedule
// (deferred mid-week or carried at the end of it), for the dashboard's "Left
// unscheduled" widget. Derived from the durable weekly record's 'carried'
// outcomes joined with the carry-over markers — no new storage, no mutations.
export async function GET() {
  try {
    const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const [record, carryOvers] = await Promise.all([getWeeklyStats(weekStart), getCarryOvers()]);
    const tasks = unscheduledThisWeek(record, carryOvers);
    return NextResponse.json({ weekStart, tasks });
  } catch (error) {
    console.error('[Dashboard Unscheduled] Failed to load unscheduled tasks:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load unscheduled tasks' },
      { status: 500 }
    );
  }
}
