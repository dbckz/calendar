'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ChevronRight, Clock } from 'lucide-react';
import { CalendarEvent } from '@/types';
import { DEFAULT_ROLLOVER_HOUR, logicalTodayDate } from '@/lib/date-utils';

const UPCOMING_COUNT = 4;

// Compact "now + next few events" card. Tapping it (or any event) jumps to the
// Day tab rather than nesting a scrollable agenda inside the dashboard.
export function MobileTodayCard({
  events,
  rolloverHour = DEFAULT_ROLLOVER_HOUR,
  onExpand,
}: {
  events: CalendarEvent[]; // today's timed events, any order
  rolloverHour?: number;
  onExpand: () => void;
}) {
  // `now` stays null until after mount: SSR and hydration can straddle a
  // minute/day boundary, so rendering the live time during SSR causes a
  // hydration text mismatch (same guard as the desktop TodayColumn).
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // Set from timers rather than the effect body so the first value arrives in
    // a callback (no synchronous setState during the effect).
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const sorted = [...events].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const nowMs = now?.getTime();
  const current = nowMs === undefined
    ? []
    : sorted.filter(e => e.startTime.getTime() <= nowMs && e.endTime.getTime() >= nowMs);
  const upcoming = nowMs === undefined
    ? []
    : sorted.filter(e => e.startTime.getTime() > nowMs).slice(0, UPCOMING_COUNT);
  const shown = [...current, ...upcoming];

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <button type="button" onClick={onExpand} className="flex w-full items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Today</h2>
        <span className="flex items-center gap-1 text-sm text-gray-500">
          {now ? format(logicalTodayDate(now, rolloverHour), 'EEE, MMM d') : ''}
          <ChevronRight className="h-4 w-4 text-gray-400" />
        </span>
      </button>

      {sorted.length === 0 ? (
        <p className="mt-2 text-sm italic text-gray-400">Nothing scheduled today.</p>
      ) : shown.length === 0 ? (
        <p className="mt-2 text-sm italic text-gray-400">
          {now ? 'Done for the day — nothing else scheduled.' : ''}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {shown.map(event => {
            const isNow = nowMs !== undefined &&
              event.startTime.getTime() <= nowMs && event.endTime.getTime() >= nowMs;
            return (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={onExpand}
                  className={`flex w-full items-start gap-3 rounded-lg border p-2 text-left ${
                    isNow ? 'border-orange-300 bg-orange-50' : 'border-gray-100'
                  } active:bg-gray-50`}
                >
                  <span
                    className="mt-1 h-8 w-1.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: event.color || '#94a3b8' }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">{event.title}</span>
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock className="h-3 w-3" />
                      {format(event.startTime, 'h:mm a')} – {format(event.endTime, 'h:mm a')}
                      {isNow && <span className="ml-1 font-semibold text-orange-600">Now</span>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
