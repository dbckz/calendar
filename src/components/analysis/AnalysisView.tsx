'use client';

import { useCallback, useEffect, useState } from 'react';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { Loader2, RefreshCw } from 'lucide-react';

import { pct } from './format';
import { StackedTimeBars } from './StackedTimeBars';
import { TimeDrilldownModal, type DrilldownTarget } from './TimeDrilldownModal';
import type { AnalysisResponse, ReconcileResponse, WeekSummary } from './types';

// Colour scale for the trend columns: green when most of what was scheduled got
// finished or started, amber in the middle, orange when the week was heavily
// over-scheduled. The per-category bars split finished from started instead, so
// they use the fixed emerald/amber pair rather than this scale.
function rateColor(rate: number): string {
  if (rate >= 0.8) return 'bg-emerald-500';
  if (rate >= 0.5) return 'bg-amber-500';
  return 'bg-orange-400';
}

function weekLabel(weekStart: string): string {
  const parsed = parseISO(weekStart);
  return Number.isNaN(parsed.getTime()) ? weekStart : `Week of ${format(parsed, 'd MMM yyyy')}`;
}

function shortWeekLabel(weekStart: string): string {
  const parsed = parseISO(weekStart);
  return Number.isNaN(parsed.getTime()) ? weekStart : format(parsed, 'd MMM');
}

function syncedLabel(lastSyncedAt: string | null): string {
  if (!lastSyncedAt) return 'Never synced';
  const parsed = parseISO(lastSyncedAt);
  if (Number.isNaN(parsed.getTime())) return 'Never synced';
  return `Last synced ${formatDistanceToNow(parsed, { addSuffix: true })}`;
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
        Share of scheduled tasks finished or started, oldest week first.
      </p>
      <ul className="flex items-end gap-2 h-24">
        {oldestFirst.map(week => (
          <li key={week.weekStart} className="flex-1 flex flex-col items-center justify-end h-full">
            <span className="text-[11px] text-gray-500 mb-1">{pct(week.completionRate)}%</span>
            <div className="w-full h-full bg-gray-100 rounded-full flex flex-col justify-end overflow-hidden">
              <div
                className={`w-full rounded-full ${rateColor(week.completionRate)}`}
                style={{ height: `${Math.max(pct(week.completionRate), 2)}%` }}
                aria-label={`${shortWeekLabel(week.weekStart)}: ${pct(week.completionRate)} per cent finished or started`}
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

function WeekCard({
  week,
  onSelectSegment,
}: {
  week: WeekSummary;
  onSelectSegment: (target: DrilldownTarget) => void;
}) {
  const started = week.totalStarted ?? 0;
  const progressed = week.totalCompleted + started;
  const untouched = week.totalScheduled - progressed;

  return (
    <div className={CARD}>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-base font-semibold text-gray-900">{weekLabel(week.weekStart)}</h3>
        <span className="text-sm text-gray-500">
          <span className={`font-semibold ${week.completionRate >= 0.8 ? 'text-emerald-600' : 'text-gray-800'}`}>
            {pct(week.completionRate)}%
          </span>{' '}
          finished or started
        </span>
      </div>

      <div className="text-[13px] text-gray-600 mb-3">
        {progressed} of {week.totalScheduled} scheduled tasks finished or started
        {started > 0 && <span className="text-amber-600"> · {started} started</span>}
        {untouched > 0 && <span className="text-orange-600"> — {untouched} untouched</span>}
      </div>

      {week.categories.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Nothing was scheduled this week.</p>
      ) : (
        <ul className="space-y-1.5">
          {week.categories.map(cat => {
            const catStarted = cat.started ?? 0;
            const donePct = cat.scheduled > 0 ? pct(cat.completed / cat.scheduled) : 0;
            const startedPct =
              cat.scheduled > 0 ? Math.min(100 - donePct, pct(catStarted / cat.scheduled)) : 0;
            return (
              <li key={cat.category}>
                <div className="flex items-center justify-between text-[13px] mb-0.5">
                  <span className="font-medium text-gray-800">{cat.category}</span>
                  <span className="text-gray-500">
                    {cat.completed + catStarted} / {cat.scheduled}
                    {catStarted > 0 && <span className="text-amber-600"> ({catStarted} started)</span>}
                    {cat.carried > 0 && <span className="text-amber-600"> ({cat.carried} carried)</span>}
                    {cat.dropped > 0 && <span className="text-gray-400"> ({cat.dropped} dropped)</span>}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden flex">
                  <div className="h-full bg-emerald-500" style={{ width: `${donePct}%` }} />
                  <div className="h-full bg-amber-500" style={{ width: `${startedPct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <StackedTimeBars week={week} onSelect={onSelectSegment} />
    </div>
  );
}

export function AnalysisView() {
  const [weeks, setWeeks] = useState<WeekSummary[] | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [drilldown, setDrilldown] = useState<DrilldownTarget | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/analysis');
    const body = (await res.json()) as AnalysisResponse & { error?: string };
    if (!res.ok) throw new Error(body.error || 'Failed to load analysis');
    return body;
  }, []);

  useEffect(() => {
    let cancelled = false;
    load()
      .then(body => {
        if (cancelled) return;
        setWeeks(body.weeks ?? []);
        setLastSyncedAt(body.lastSyncedAt ?? null);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load analysis');
      });
    return () => { cancelled = true; };
  }, [load]);

  // Pull fresh calendar time, then re-read the summaries so the bars move.
  const sync = async () => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch('/api/time-tracking/reconcile', { method: 'POST' });
      const body = (await res.json()) as ReconcileResponse & { error?: string };
      if (!res.ok) throw new Error(body.error || 'Failed to sync from calendar');
      const refreshed = await load();
      setWeeks(refreshed.weeks ?? []);
      setLastSyncedAt(refreshed.lastSyncedAt ?? body.lastSyncedAt ?? null);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Failed to sync from calendar');
    } finally {
      setIsSyncing(false);
    }
  };

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={sync}
          disabled={isSyncing}
          className="flex items-center gap-2 px-3 py-1.5 text-[13px] font-medium bg-white border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSyncing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 text-gray-400" />
          )}
          Sync from calendar
        </button>
        {weeks !== null && (
          <span className="text-xs text-gray-400">{syncedLabel(lastSyncedAt)}</span>
        )}
      </div>
      {syncError && <span className="text-xs text-red-600">{syncError}</span>}
    </div>
  );

  let body;
  if (error) {
    body = (
      <div className={CARD}>
        <h2 className="text-base font-semibold text-gray-900">Analysis</h2>
        <p className="text-sm text-red-600 mt-1">{error}</p>
      </div>
    );
  } else if (weeks === null) {
    body = (
      <div className={`${CARD} flex items-center justify-center py-10`}>
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500" />
      </div>
    );
  } else if (weeks.length === 0) {
    body = (
      <div className={CARD}>
        <h2 className="text-base font-semibold text-gray-900">Analysis</h2>
        <p className="text-sm text-gray-500 mt-1">
          Analysis needs at least a week of data. It will fill in as weeks complete — planned
          against completed work per category, and time worked per organisation.
        </p>
      </div>
    );
  } else {
    body = (
      <>
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
          <WeekCard key={week.weekStart} week={week} onSelectSegment={setDrilldown} />
        ))}
      </>
    );
  }

  return (
    <div className="space-y-4">
      {header}
      {body}
      <TimeDrilldownModal target={drilldown} onClose={() => setDrilldown(null)} />
    </div>
  );
}

export default AnalysisView;
