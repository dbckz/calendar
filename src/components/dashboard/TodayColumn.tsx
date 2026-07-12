'use client';

import { format } from 'date-fns';
import { Clock } from 'lucide-react';
import { CalendarEvent } from '@/types';

interface TodayColumnProps {
  events: CalendarEvent[]; // today's timed events, any order
}

export function TodayColumn({ events }: TodayColumnProps) {
  const sorted = [...events].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime()
  );

  const now = new Date();

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Today</h2>
        <span className="text-sm text-gray-500">{format(now, 'EEEE, MMM d')}</span>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Nothing scheduled today.</p>
      ) : (
        <ul className="space-y-2 overflow-y-auto flex-1 min-h-0">
          {sorted.map(event => {
            const isPast = event.endTime.getTime() < now.getTime();
            const isNow = event.startTime.getTime() <= now.getTime() && event.endTime.getTime() >= now.getTime();
            return (
              <li
                key={event.id}
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
            );
          })}
        </ul>
      )}
    </div>
  );
}
