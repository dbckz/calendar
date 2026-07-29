'use client';

import { Clock, MapPin } from 'lucide-react';
import { SOURCE_STYLES, formatTimeRange, plainDescription, sourceLabel } from '@/lib/event-display';
import { CalendarEvent } from '@/types';

export function MobileEventCard({
  event,
  onSelect,
  isPast,
  isCurrent,
}: {
  event: CalendarEvent;
  onSelect: (event: CalendarEvent) => void;
  isPast: boolean;
  isCurrent: boolean;
}) {
  const description = plainDescription(event.description);
  const sourceStyle = SOURCE_STYLES[event.source];

  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      className={`w-full rounded-lg border bg-white p-3 text-left transition-colors active:bg-gray-50 ${
        isPast ? 'opacity-50 grayscale-[30%]' : ''
      } ${
        isCurrent
          ? 'border-red-300 shadow-lg shadow-red-500/20 ring-2 ring-red-400/70'
          : 'border-gray-200 shadow-sm'
      }`}
      style={{ borderLeftColor: event.color || undefined, borderLeftWidth: '4px' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3
              className={`text-base font-semibold leading-snug text-gray-950 ${
                event.completed ? 'line-through text-gray-500' : ''
              }`}
            >
              {event.title}
            </h3>
            {isCurrent && (
              <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                Now
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-4 w-4 text-gray-400" />
              {formatTimeRange(event)}
            </span>
            {event.location && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin className="h-4 w-4 flex-shrink-0 text-gray-400" />
                <span className="truncate">{event.location}</span>
              </span>
            )}
          </div>
        </div>
        <span
          className={`flex-shrink-0 rounded-full border px-2 py-1 text-xs font-medium ${sourceStyle.className}`}
        >
          {sourceLabel(event)}
        </span>
      </div>

      {description && (
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-gray-600">{description}</p>
      )}
    </button>
  );
}
