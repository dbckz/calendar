'use client';

import { useMemo } from 'react';
import { format } from 'date-fns';
import { CalendarEvent } from '@/types';
import { EventCard } from './EventCard';

interface TimelineProps {
  events: CalendarEvent[];
  onToggleComplete?: (id: string, source: 'adhoc' | 'asana') => void;
  onDeleteTask?: (id: string) => void;
}

export function Timeline({ events, onToggleComplete, onDeleteTask }: TimelineProps) {
  const hours = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => i);
  }, []);

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }, [events]);

  const allDayEvents = useMemo(() => {
    return sortedEvents.filter(e => e.allDay);
  }, [sortedEvents]);

  const timedEvents = useMemo(() => {
    return sortedEvents.filter(e => !e.allDay);
  }, [sortedEvents]);

  const getEventsForHour = (hour: number) => {
    return timedEvents.filter(event => {
      const eventHour = event.startTime.getHours();
      return eventHour === hour;
    });
  };

  const currentHour = new Date().getHours();

  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg">No events scheduled for this day</p>
        <p className="text-sm mt-1">Add a task or connect your calendar to see events</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* All-day events */}
      {allDayEvents.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-2">All Day</h3>
          <div className="space-y-2">
            {allDayEvents.map(event => (
              <EventCard
                key={event.id}
                event={event}
                onToggleComplete={
                  event.source === 'adhoc' || event.source === 'asana'
                    ? () => onToggleComplete?.(event.id, event.source as 'adhoc' | 'asana')
                    : undefined
                }
                onDelete={event.source === 'adhoc' ? onDeleteTask : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="relative">
        {hours.map(hour => {
          const hourEvents = getEventsForHour(hour);
          const isCurrentHour = hour === currentHour;

          return (
            <div
              key={hour}
              className={`flex min-h-[60px] border-t border-gray-100 ${
                isCurrentHour ? 'bg-blue-50/50' : ''
              }`}
            >
              <div className="w-20 flex-shrink-0 pr-4 py-2 text-right">
                <span
                  className={`text-sm ${
                    isCurrentHour ? 'font-semibold text-blue-600' : 'text-gray-500'
                  }`}
                >
                  {format(new Date().setHours(hour, 0, 0, 0), 'h a')}
                </span>
              </div>
              <div className="flex-1 py-2 space-y-2">
                {hourEvents.map(event => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onToggleComplete={
                      event.source === 'adhoc' || event.source === 'asana'
                        ? () => onToggleComplete?.(event.id, event.source as 'adhoc' | 'asana')
                        : undefined
                    }
                    onDelete={event.source === 'adhoc' ? onDeleteTask : undefined}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
