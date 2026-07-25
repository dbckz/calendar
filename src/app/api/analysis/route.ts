import { NextResponse } from 'next/server';
import { addDays, format } from 'date-fns';

import { getIntegrations } from '@/lib/integration-storage';
import {
  getAllWeeklyStats,
  getLastReconciledAt,
  getAnalysisStartDate,
} from '@/lib/user-data-storage';
import { getTimeTrackingData } from '@/lib/time-tracking-storage';
import {
  categoryMinutesFromRecord,
  stackedTime,
  summariseWeek,
  type WeekSummary,
} from '@/lib/weekly-stats';

// One drill-down row: a single counted event behind a stacked segment.
interface AnalysisEventRow {
  integrationId: string;
  category: string;
  title: string;
  date: string; // yyyy-MM-dd
  durationMinutes: number; // the minutes it actually contributed
}

// GET → one summary per recorded week, newest first, plus the category-stacked
// time breakdown and the per-event detail behind it.
//
// Read-only. Totals come from the durable weekly record; the category split
// comes from the same record where present, and the drill-down detail from the
// per-event time-tracking log. Past weeks are final, so the summaries are stable.
export async function GET() {
  try {
    const [records, settings, tracking, lastSyncedAt, analysisStartDate] = await Promise.all([
      getAllWeeklyStats(),
      getIntegrations(),
      getTimeTrackingData(),
      getLastReconciledAt(),
      getAnalysisStartDate(),
    ]);

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

    // Per-event rows, bucketed by the week they fall in, from the time-tracking
    // log. `countedMinutes` is the overlap-resolved contribution; older records
    // predate it and fall back to their full duration.
    const eventsByWeek = new Map<string, AnalysisEventRow[]>();
    for (const day of tracking.dailyRecords) {
      for (const event of day.events ?? []) {
        const minutes = event.countedMinutes ?? event.durationMinutes;
        if (!minutes || minutes <= 0) continue;
        const weekStart = weekStartFor(day.date);
        const rows = eventsByWeek.get(weekStart) ?? [];
        rows.push({
          integrationId: event.integrationId,
          category: event.category ?? 'Other',
          title: event.title,
          date: day.date,
          durationMinutes: minutes,
        });
        eventsByWeek.set(weekStart, rows);
      }
    }

    const weeks = Object.values(records)
      // Weeks before the analysis start date are from before the app was in use.
      .filter(record => record.weekStart >= analysisStartDate)
      .map(record => {
        const week = withAllIntegrations(summariseWeek(record));
        return {
          ...week,
          timeByIntegration: stackedTime(
            week.minutesWorkedByIntegration.map(i => ({
              integrationId: i.integrationId,
              integrationName: i.integrationName,
              minutes: i.minutes,
            })),
            categoryMinutesFromRecord(record)
          ),
          events: (eventsByWeek.get(week.weekStart) ?? []).sort(
            (a, b) => a.date.localeCompare(b.date) || b.durationMinutes - a.durationMinutes
          ),
        };
      })
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart));

    return NextResponse.json({ weeks, lastSyncedAt });
  } catch (error) {
    console.error('Error building weekly analysis:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to build weekly analysis' },
      { status: 500 }
    );
  }
}

// Monday of the week containing a yyyy-MM-dd date, computed in local time to
// match every other week boundary in the app.
function weekStartFor(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const local = new Date(y, m - 1, d);
  const offset = (local.getDay() + 6) % 7; // Monday = 0
  return format(addDays(local, -offset), 'yyyy-MM-dd');
}
