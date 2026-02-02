'use client';

import { CalendarEvent } from '@/types';
import { Calendar } from 'lucide-react';

interface AllDayEventsBarProps {
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onEventDoubleClick?: (event: CalendarEvent) => void;
}

// Simple color hash for consistent event colors
function getEventColor(event: CalendarEvent): string {
  const colors = [
    'bg-blue-100 text-blue-700 border-blue-200',
    'bg-green-100 text-green-700 border-green-200',
    'bg-purple-100 text-purple-700 border-purple-200',
    'bg-amber-100 text-amber-700 border-amber-200',
    'bg-pink-100 text-pink-700 border-pink-200',
    'bg-cyan-100 text-cyan-700 border-cyan-200',
  ];

  // Use integration name or source for consistent color
  const key = event.integrationId || event.source || event.id;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i);
    hash |= 0;
  }
  return colors[Math.abs(hash) % colors.length];
}

export function AllDayEventsBar({ events, onEventClick, onEventDoubleClick }: AllDayEventsBarProps) {
  if (events.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border shadow-sm p-3 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Calendar className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-medium text-gray-700">All-day events</span>
        <span className="text-xs text-gray-400">({events.length})</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {events.map(event => (
          <button
            key={`${event.source}-${event.id}`}
            onClick={() => onEventClick?.(event)}
            onDoubleClick={() => onEventDoubleClick?.(event)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${getEventColor(event)} hover:shadow-md hover:scale-105 cursor-pointer`}
            title={event.location ? `${event.title} • ${event.location}` : event.title}
          >
            <span className="truncate max-w-[200px]">{event.title}</span>
            {event.location && (
              <span className="text-xs opacity-75 truncate max-w-[100px]">
                • {event.location}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
