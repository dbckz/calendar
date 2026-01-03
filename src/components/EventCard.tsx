'use client';

import { format } from 'date-fns';
import { Check, Clock, MapPin, Trash2 } from 'lucide-react';
import { CalendarEvent } from '@/types';

interface EventCardProps {
  event: CalendarEvent;
  onToggleComplete?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function EventCard({ event, onToggleComplete, onDelete }: EventCardProps) {
  const sourceLabels = {
    google: 'Google Calendar',
    asana: 'Asana',
    adhoc: 'Task',
  };

  const sourceColors = {
    google: 'bg-blue-100 text-blue-700',
    asana: 'bg-orange-100 text-orange-700',
    adhoc: 'bg-purple-100 text-purple-700',
  };

  const isCompletable = event.source === 'adhoc' || event.source === 'asana';

  return (
    <div
      className={`bg-white rounded-lg border shadow-sm overflow-hidden transition-all hover:shadow-md ${
        event.completed ? 'opacity-60' : ''
      }`}
      style={{ borderLeftColor: event.color, borderLeftWidth: '4px' }}
    >
      <div className="p-3">
        <div className="flex items-start gap-3">
          {isCompletable && (
            <button
              onClick={() => onToggleComplete?.(event.id)}
              className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                event.completed
                  ? 'bg-green-500 border-green-500 text-white'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              {event.completed && <Check className="w-3 h-3" />}
            </button>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3
                className={`font-medium text-gray-900 ${
                  event.completed ? 'line-through text-gray-500' : ''
                }`}
              >
                {event.title}
              </h3>
              <span
                className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                  sourceColors[event.source]
                }`}
              >
                {sourceLabels[event.source]}
              </span>
            </div>

            {event.description && (
              <p className="text-sm text-gray-600 mt-1 line-clamp-2">{event.description}</p>
            )}

            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>
                  {event.allDay
                    ? 'All day'
                    : `${format(event.startTime, 'h:mm a')} - ${format(event.endTime, 'h:mm a')}`}
                </span>
              </div>
              {event.location && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  <span className="truncate max-w-[150px]">{event.location}</span>
                </div>
              )}
            </div>
          </div>

          {event.source === 'adhoc' && onDelete && (
            <button
              onClick={() => onDelete(event.id)}
              className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
              aria-label="Delete task"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
