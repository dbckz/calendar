'use client';

import { useMemo } from 'react';
import { CalendarEvent } from '@/types';
import { EventCard } from './EventCard';

interface ListViewProps {
  events: CalendarEvent[];
  onToggleComplete?: (id: string, source: 'adhoc' | 'asana') => void;
  onDeleteTask?: (id: string) => void;
}

export function ListView({ events, onToggleComplete, onDeleteTask }: ListViewProps) {
  const groupedEvents = useMemo(() => {
    const groups: {
      allDay: CalendarEvent[];
      morning: CalendarEvent[];
      afternoon: CalendarEvent[];
      evening: CalendarEvent[];
    } = {
      allDay: [],
      morning: [],
      afternoon: [],
      evening: [],
    };

    const sortedEvents = [...events].sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime()
    );

    sortedEvents.forEach(event => {
      if (event.allDay) {
        groups.allDay.push(event);
      } else {
        const hour = event.startTime.getHours();
        if (hour < 12) {
          groups.morning.push(event);
        } else if (hour < 17) {
          groups.afternoon.push(event);
        } else {
          groups.evening.push(event);
        }
      }
    });

    return groups;
  }, [events]);

  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg">No events scheduled for this day</p>
        <p className="text-sm mt-1">Add a task or connect your calendar to see events</p>
      </div>
    );
  }

  const sections = [
    { title: 'All Day', events: groupedEvents.allDay },
    { title: 'Morning', events: groupedEvents.morning },
    { title: 'Afternoon', events: groupedEvents.afternoon },
    { title: 'Evening', events: groupedEvents.evening },
  ].filter(section => section.events.length > 0);

  return (
    <div className="space-y-6">
      {sections.map(section => (
        <div key={section.title}>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {section.title}
          </h3>
          <div className="space-y-2">
            {section.events.map(event => (
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
      ))}
    </div>
  );
}
