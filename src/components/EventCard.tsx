'use client';

import { format } from 'date-fns';
import { Check, Clock, MapPin, Trash2, X } from 'lucide-react';
import { CalendarEvent } from '@/types';

interface EventCardProps {
  event: CalendarEvent;
  onToggleComplete?: (id: string) => void;
  onDelete?: (id: string) => void;
  onUnschedule?: (id: string) => void;
  onDeleteEvent?: () => void;
  compact?: boolean;
  isPast?: boolean;
}

export function EventCard({ event, onToggleComplete, onDelete, onUnschedule, onDeleteEvent, compact, isPast }: EventCardProps) {
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

  // Compact view for timeline
  if (compact) {
    return (
      <div
        className={`h-full rounded-lg border shadow-sm overflow-hidden transition-all hover:shadow-md ${
          event.completed || isPast ? 'opacity-50' : ''
        } ${isPast ? 'grayscale-[30%]' : ''}`}
        style={{
          borderLeftColor: event.color,
          borderLeftWidth: '4px',
          backgroundColor: event.color ? `${event.color}15` : 'white',
        }}
      >
        <div className="p-2 h-full flex flex-col">
          <div className="flex items-start gap-2">
            {isCompletable && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleComplete?.(event.id);
                }}
                className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                  event.completed
                    ? 'bg-green-500 border-green-500 text-white'
                    : 'border-gray-300 hover:border-gray-400 bg-white'
                }`}
              >
                {event.completed && <Check className="w-2.5 h-2.5" />}
              </button>
            )}
            <div className="flex-1 min-w-0">
              <h3
                className={`text-sm font-medium text-gray-900 line-clamp-2 ${
                  event.completed ? 'line-through text-gray-500' : ''
                }`}
              >
                {event.title}
              </h3>
              <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
                <span>
                  {format(event.startTime, 'h:mm a')} - {format(event.endTime, 'h:mm a')}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              {onUnschedule && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnschedule(event.id);
                  }}
                  className="p-0.5 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                  aria-label="Unschedule task"
                  title="Remove from calendar"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
              {event.source === 'adhoc' && onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(event.id);
                  }}
                  className="p-0.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                  aria-label="Delete task"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
              {onDeleteEvent && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteEvent();
                  }}
                  className="p-0.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                  aria-label="Delete event"
                  title="Delete event"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Full view for all-day events and list view
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
