'use client';

import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';

import type { summariseWeek } from '@/lib/weekly-stats';

type WeekSummary = ReturnType<typeof summariseWeek>;

interface AnalysisResponse {
  weeks: WeekSummary[];
}

// Colour scale shared by the per-category bars and the trend columns: green
// when most of what was scheduled got done, amber in the middle, orange when
// the week was heavily over-scheduled.
function rateColor(rate: number): string {
  if (rate >= 0.8) return 'bg-emerald-500';
  if (rate >= 0.5) return 'bg-amber-500';
  return 'bg-orange-400';
}

function pct(rate: number): number {
  return Math.min(100, Math.round(rate * 100));
}

function formatMinutes(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded}m`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

function weekLabel(weekStart: string): string {
  const parsed = parseISO(weekStart);
  return Number.isNaN(parsed.getTime()) ? weekStart : `Week of ${format(parsed, 'd MMM yyyy')}`;
}

function shortWeekLabel(weekStart: string): string {
  const parsed = parseISO(weekStart);
  return Number.isNaN(parsed.getTime()) ? weekStart : format(parsed, 'd MMM');
}

const CARD = 'bg-white rounded-xl border border-gray-200 p-4';

// Completion rate across weeks, oldest on the left. Only rendered with at least
// two weeks — a single column is a data point, not a trend, and reads as broken.
function CompletionTrend({ weeks }: { weeks: WeekSummary[] }) {
  const oldestFirst = [...weeks].reverse();

  return (
    <div className={CARD}>
      <h2 className="text-base font-semibold text-gray-900">Completion trend</h2>
      <p className="text-[11px] text-gray-400 mb-3">
        Share of scheduled tasks completed, oldest week first.
      </p>
      <ul className="flex items-end gap-2 h-24">
        {oldestFirst.map(week => (
          <li key={week.weekStart} className="flex-1 flex flex-col items-center justify-end h-full">
            <span className="text-[11px] text-gray-500 mb-1">{pct(week.completionRate)}%</span>
            <div className="w-full h-full bg-gray-100 rounded-full flex flex-col justify-end overflow-hidden">
              <div
                className={`w-full rounded-full ${rateColor(week.completionRate)}`}
                style={{ height: `${Math.max(pct(week.completionRate), 2)}%` }}
                aria-label={`${shortWeekLabel(week.weekStart)}: ${pct(week.completionRate)} per cent completed`}
              />
            </div>
            <span className="text-[10px] text-gray-400 mt-1 truncate w-full text-center">
              {shortWeekLabel(week.weekStart)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WeekCard({ week }: { week: WeekSummary }) {
  const overScheduledBy = week.totalScheduled - week.totalCompleted;

  return (
    <div className={CARD}>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-base font-semibold text-gray-900">{weekLabel(week.weekStart)}</h3>
        <span className="text-sm text-gray-500">
          <span className={`font-semibold ${week.completionRate >= 0.8 ? 'text-emerald-600' : 'text-gray-800'}`}>
            {pct(week.completionRate)}%
          </span>{' '}
          completed
        </span>
      </div>

      <div className="text-[13px] text-gray-600 mb-3">
        {week.totalCompleted} of {week.totalScheduled} scheduled tasks done
        {overScheduledBy > 0 && (
          <span className="text-orange-600"> — {overScheduledBy} left undone</span>
        )}
      </div>

      {week.categories.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Nothing was scheduled this week.</p>
      ) : (
        <ul className="space-y-1.5">
          {week.categories.map(cat => {
            const rate = cat.scheduled > 0 ? cat.completed / cat.scheduled : 0;
            return (
              <li key={cat.category}>
                <div className="flex items-center justify-between text-[13px] mb-0.5">
                  <span className="font-medium text-gray-800">{cat.category}</span>
                  <span className="text-gray-500">
                    {cat.completed} / {cat.scheduled}
                    {cat.carried > 0 && <span className="text-amber-600"> ({cat.carried} carried)</span>}
                    {cat.dropped > 0 && <span className="text-gray-400"> ({cat.dropped} dropped)</span>}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${rateColor(rate)}`}
                    style={{ width: `${pct(rate)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 pt-3 border-t border-gray-100">
        <div className="flex items-baseline justify-between text-[13px] mb-1.5">
          <span className="font-medium text-gray-800">Time worked</span>
          <span className="text-gray-500">{formatMinutes(week.totalMinutesWorked)} total</span>
        </div>
        {week.minutesWorkedByIntegration.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No time recorded this week.</p>
        ) : (
          <ul className="space-y-1.5">
            {week.minutesWorkedByIntegration.map(entry => {
              const share = week.totalMinutesWorked > 0 ? entry.minutes / week.totalMinutesWorked : 0;
              return (
                <li key={entry.integrationId}>
                  <div className="flex items-center justify-between text-[13px] mb-0.5">
                    <span className="text-gray-700">{entry.integrationName}</span>
                    <span className="text-gray-500">{formatMinutes(entry.minutes)}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-400"
                      style={{ width: `${pct(share)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export function AnalysisView() {
  const [weeks, setWeeks] = useState<WeekSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/analysis')
      .then(async res => {
        const body = (await res.json()) as AnalysisResponse & { error?: string };
        if (!res.ok) throw new Error(body.error || 'Failed to load analysis');
        return body;
      })
      .then(body => {
        if (!cancelled) setWeeks(body.weeks ?? []);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load analysis');
      });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className={CARD}>
        <h2 className="text-base font-semibold text-gray-900">Analysis</h2>
        <p className="text-sm text-red-600 mt-1">{error}</p>
      </div>
    );
  }

  if (weeks === null) {
    return (
      <div className={`${CARD} flex items-center justify-center py-10`}>
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500" />
      </div>
    );
  }

  if (weeks.length === 0) {
    return (
      <div className={CARD}>
        <h2 className="text-base font-semibold text-gray-900">Analysis</h2>
        <p className="text-sm text-gray-500 mt-1">
          Analysis needs at least a week of data. It will fill in as weeks complete — planned
          against completed work per category, and time worked per organisation.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {weeks.length >= 2 ? (
        <CompletionTrend weeks={weeks} />
      ) : (
        <div className={CARD}>
          <h2 className="text-base font-semibold text-gray-900">Completion trend</h2>
          <p className="text-sm text-gray-500 mt-1">
            One week recorded so far. The trend appears once a second week completes.
          </p>
        </div>
      )}

      {weeks.map(week => (
        <WeekCard key={week.weekStart} week={week} />
      ))}
    </div>
  );
}

export default AnalysisView;
