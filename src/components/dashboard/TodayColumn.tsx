'use client';

import { Fragment, forwardRef, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Clock } from 'lucide-react';
import { CalendarEvent } from '@/types';
import { DEFAULT_ROLLOVER_HOUR, logicalTodayDate } from '@/lib/date-utils';

interface TodayColumnProps {
  events: CalendarEvent[]; // today's timed events, any order
  rolloverHour?: number; // logical-day rollover hour, for the date label
}

// A red current-time line, like a calendar's "now" indicator. Rendered between
// the last-started and next-upcoming event in the sorted list.
const NowLine = forwardRef<HTMLLIElement, { now: Date }>(function NowLine({ now }, ref) {
  return (
    <li ref={ref} className="flex items-center gap-2 -my-1 select-none" aria-label="current time">
      <span className="text-[10px] font-semibold text-red-500 tabular-nums flex-shrink-0">
        {format(now, 'h:mm a')}
      </span>
      <span className="h-px flex-1 bg-red-500" />
      <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
    </li>
  );
});

export function TodayColumn({ events, rolloverHour = DEFAULT_ROLLOVER_HOUR }: TodayColumnProps) {
  const sorted = [...events].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime()
  );

  // Re-render the now-line every minute so it stays accurate without a reload.
  // `now` stays null until after mount: the server and client can't agree on the
  // current time (SSR happens seconds before hydration, and can straddle a
  // minute/day boundary), so rendering it during SSR causes a hydration text
  // mismatch. Gating on mount keeps the first client render identical to the SSR
  // HTML, then fills in the live time.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Index of the first event that starts after now — where the now-line goes.
  // -1 (all events already started) means the line sits at the very end; -2 (not
  // yet mounted) suppresses the line entirely so SSR and first client render match.
  const nowMs = now?.getTime();
  const nowIndex = nowMs === undefined ? -2 : sorted.findIndex(e => e.startTime.getTime() > nowMs);

  // Scroll the now-line into view once the day's events have loaded, so the
  // current moment is visible without manual scrolling.
  const nowRef = useRef<HTMLLIElement>(null);
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (scrolledRef.current || sorted.length === 0) return;
    const el = nowRef.current;
    if (el) {
      // rAF so layout has settled before we scroll.
      requestAnimationFrame(() => el.scrollIntoView({ block: 'center' }));
      scrolledRef.current = true;
    }
  }, [sorted.length]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Today</h2>
        <span className="text-sm text-gray-500">{now ? format(logicalTodayDate(now, rolloverHour), 'EEEE, MMM d') : ''}</span>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Nothing scheduled today.</p>
      ) : (
        <ul className="space-y-2 overflow-y-auto flex-1 min-h-0">
          {sorted.map((event, i) => {
            const isPast = nowMs !== undefined && event.endTime.getTime() < nowMs;
            const isNow = nowMs !== undefined && event.startTime.getTime() <= nowMs && event.endTime.getTime() >= nowMs;
            return (
              <Fragment key={event.id}>
                {now && i === nowIndex && <NowLine now={now} ref={nowRef} />}
                <li
                  className={`flex items-start gap-3 p-2 rounded-lg border ${
                    isNow ? 'border-orange-300 bg-orange-50' : 'border-gray-100'
                  } ${isPast ? 'opacity-50' : ''}`}
                >
                  <span
                    className="mt-1 w-1.5 h-8 rounded-full flex-shrink-0"
                    style={{ backgroundColor: event.color || '#94a3b8' }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{event.title}</p>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {format(event.startTime, 'h:mm a')} – {format(event.endTime, 'h:mm a')}
                    </p>
                  </div>
                </li>
              </Fragment>
            );
          })}
          {now && nowIndex === -1 && <NowLine now={now} ref={nowRef} />}
        </ul>
      )}
    </div>
  );
}
