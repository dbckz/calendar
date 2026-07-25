import { NextResponse } from 'next/server';

import { getIntegrations } from '@/lib/integration-storage';
import { getAllWeeklyStats } from '@/lib/user-data-storage';
import { summariseWeek, type WeekSummary } from '@/lib/weekly-stats';

// GET → one summary per recorded week, newest first.
//
// Read-only: the weekly-stats store is written during planning and review, so
// nothing here mutates. Past weeks are final, so the summaries are stable.
export async function GET() {
  try {
    const [records, settings] = await Promise.all([getAllWeeklyStats(), getIntegrations()]);

    // Every enabled workspace appears in every week's time breakdown, zero or
    // not — a 0m row is a data point (a week without DBC work), not noise.
    const enabled = settings.asanaIntegrations.filter(i => i.enabled);
    const withAllIntegrations = (week: WeekSummary): WeekSummary => ({
      ...week,
      minutesWorkedByIntegration: enabled
        .map(i =>
          week.minutesWorkedByIntegration.find(e => e.integrationId === i.id) ?? {
            integrationId: i.id,
            integrationName: i.name,
            minutes: 0,
          }
        )
        .concat(week.minutesWorkedByIntegration.filter(e => !enabled.some(i => i.id === e.integrationId)))
        .sort((a, b) => a.integrationName.localeCompare(b.integrationName)),
    });

    const weeks = Object.values(records)
      .map(summariseWeek)
      .map(withAllIntegrations)
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
