'use client';

import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import { CalendarEvent, DragItem } from '@/types';
import { EventCard } from './EventCard';

interface TimelineProps {
  events: CalendarEvent[];
  selectedDate: Date;
  onToggleComplete?: (id: string, source: 'adhoc' | 'asana') => void;
  onDeleteTask?: (id: string) => void;
  onDropTask?: (dragItem: DragItem, startTime: Date, endTime: Date) => void;
  onEventMove?: (eventId: string, source: 'adhoc' | 'asana' | 'google', startTime: Date, endTime: Date) => void;
  onUnscheduleTask?: (eventId: string, source: 'adhoc' | 'asana') => void;
  onDeleteEvent?: (event: CalendarEvent) => void;
}

interface PositionedEvent {
  event: CalendarEvent;
  column: number;
  totalColumns: number;
}

// Check if two events overlap in time
function eventsOverlap(a: CalendarEvent, b: CalendarEvent): boolean {
  return a.startTime < b.endTime && b.startTime < a.endTime;
}

// Calculate positions for overlapping events
function calculateEventPositions(events: CalendarEvent[]): PositionedEvent[] {
  if (events.length === 0) return [];

  const sorted = [...events].sort((a, b) => {
    const startDiff = a.startTime.getTime() - b.startTime.getTime();
    if (startDiff !== 0) return startDiff;
    const aDuration = a.endTime.getTime() - a.startTime.getTime();
    const bDuration = b.endTime.getTime() - b.startTime.getTime();
    return bDuration - aDuration;
  });

  const groups: CalendarEvent[][] = [];
  let currentGroup: CalendarEvent[] = [];

  for (const event of sorted) {
    const overlapsWithGroup = currentGroup.some(e => eventsOverlap(e, event));

    if (overlapsWithGroup || currentGroup.length === 0) {
      currentGroup.push(event);
    } else {
      const groupEnd = Math.max(...currentGroup.map(e => e.endTime.getTime()));
      if (event.startTime.getTime() < groupEnd) {
        currentGroup.push(event);
      } else {
        groups.push(currentGroup);
        currentGroup = [event];
      }
    }
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  const positioned: PositionedEvent[] = [];

  for (const group of groups) {
    const columns: CalendarEvent[][] = [];

    for (const event of group) {
      let placed = false;
      for (let col = 0; col < columns.length; col++) {
        const canPlace = columns[col].every(e => !eventsOverlap(e, event));
        if (canPlace) {
          columns[col].push(event);
          positioned.push({ event, column: col, totalColumns: 0 });
          placed = true;
          break;
        }
      }

      if (!placed) {
        columns.push([event]);
        positioned.push({ event, column: columns.length - 1, totalColumns: 0 });
      }
    }

    const totalCols = columns.length;
    for (const pos of positioned) {
      if (group.includes(pos.event)) {
        pos.totalColumns = totalCols;
      }
    }
  }

  return positioned;
}

const HOUR_HEIGHT = 60;
const START_HOUR = 6;
const END_HOUR = 23;
const SNAP_MINUTES = 15;

// Convert Y position to time
function yToTime(y: number, selectedDate: Date): Date {
  const hours = y / HOUR_HEIGHT + START_HOUR;
  const totalMinutes = hours * 60;
  const snappedMinutes = Math.round(totalMinutes / SNAP_MINUTES) * SNAP_MINUTES;

  const date = new Date(selectedDate);
  date.setHours(Math.floor(snappedMinutes / 60), snappedMinutes % 60, 0, 0);
  return date;
}

// Convert time to Y position
function timeToY(time: Date): number {
  const hours = time.getHours() + time.getMinutes() / 60;
  return (hours - START_HOUR) * HOUR_HEIGHT;
}

export function Timeline({
  events,
  selectedDate,
  onToggleComplete,
  onDeleteTask,
  onDropTask,
  onEventMove,
  onUnscheduleTask,
  onDeleteEvent,
}: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [dropPreviewY, setDropPreviewY] = useState<number | null>(null);

  // Get current time for checking if events are in the past
  const now = useMemo(() => new Date(), []);

  // Event dragging state
  const [draggingEvent, setDraggingEvent] = useState<{
    event: CalendarEvent;
    mode: 'move' | 'resize-top' | 'resize-bottom';
    startY: number;
    originalTop: number;
    originalHeight: number;
  } | null>(null);
  const [dragOffset, setDragOffset] = useState({ top: 0, height: 0 });

  const hours = useMemo(() => {
    return Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => i + START_HOUR);
  }, []);

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }, [events]);

  const positionedEvents = useMemo(() => {
    return calculateEventPositions(sortedEvents);
  }, [sortedEvents]);

  // Current time for the indicator line - check if viewing today
  const isToday = useMemo(() => {
    const today = new Date();
    return selectedDate.toDateString() === today.toDateString();
  }, [selectedDate]);

  // Current time position (updates on mount)
  const currentTimePosition = useMemo(() => {
    const now = new Date();
    const hours = now.getHours() + now.getMinutes() / 60;
    return (hours - START_HOUR) * HOUR_HEIGHT;
  }, []);

  // Memoize current hour - only updates on component mount
  const currentHour = useMemo(() => new Date().getHours(), []);

  // Pre-compute hour labels once
  const hourLabels = useMemo(() => {
    return hours.map(hour => format(new Date(2000, 0, 1, hour, 0, 0, 0), 'h a'));
  }, [hours]);

  // Auto-scroll to current time on mount (only for today)
  useEffect(() => {
    if (isToday && scrollContainerRef.current) {
      // Calculate scroll position to center the current time
      const scrollContainer = scrollContainerRef.current.closest('.overflow-y-auto');
      if (scrollContainer) {
        const containerHeight = scrollContainer.clientHeight;
        const scrollTarget = currentTimePosition - containerHeight / 2;
        scrollContainer.scrollTop = Math.max(0, scrollTarget);
      }
    }
  }, [isToday, currentTimePosition]);

  // Check if an event is in the past
  const isEventPast = useCallback((event: CalendarEvent) => {
    if (!isToday) return selectedDate < new Date(new Date().setHours(0, 0, 0, 0));
    return event.endTime < now;
  }, [isToday, selectedDate, now]);

  const getEventStyle = useCallback((pos: PositionedEvent) => {
    const { event, column, totalColumns } = pos;
    const startHour = event.startTime.getHours() + event.startTime.getMinutes() / 60;
    const endHour = event.endTime.getHours() + event.endTime.getMinutes() / 60;

    const clampedStart = Math.max(startHour, START_HOUR);
    const clampedEnd = Math.min(endHour, END_HOUR + 1);

    let top = (clampedStart - START_HOUR) * HOUR_HEIGHT;
    let height = Math.max((clampedEnd - clampedStart) * HOUR_HEIGHT, 30);

    // Apply drag offset if this event is being dragged
    if (draggingEvent?.event.id === event.id) {
      top += dragOffset.top;
      height += dragOffset.height;
    }

    const width = totalColumns > 1 ? `calc(${100 / totalColumns}% - 4px)` : 'calc(100% - 4px)';
    const left = totalColumns > 1 ? `calc(${(column * 100) / totalColumns}% + 2px)` : '2px';

    return {
      position: 'absolute' as const,
      top: `${top}px`,
      height: `${height}px`,
      left,
      width,
      zIndex: draggingEvent?.event.id === event.id ? 100 : 1,
      opacity: draggingEvent?.event.id === event.id ? 0.8 : 1,
    };
  }, [draggingEvent, dragOffset]);

  // Handle external drop (from sidebars)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDraggingOver(true);

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const snappedY = Math.round(y / (HOUR_HEIGHT * SNAP_MINUTES / 60)) * (HOUR_HEIGHT * SNAP_MINUTES / 60);
      setDropPreviewY(Math.max(0, Math.min(snappedY, hours.length * HOUR_HEIGHT - HOUR_HEIGHT)));
    }
  }, [hours.length]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget === e.target) {
      setIsDraggingOver(false);
      setDropPreviewY(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    setDropPreviewY(null);

    try {
      const data = e.dataTransfer.getData('application/json');
      if (!data) return;

      const dragItem: DragItem = JSON.parse(data);

      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const y = e.clientY - rect.top;

        const startTime = yToTime(y, selectedDate);
        const duration = dragItem.duration || 60;
        const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

        onDropTask?.(dragItem, startTime, endTime);
      }
    } catch (err) {
      console.error('Failed to parse drag data:', err);
    }
  }, [selectedDate, onDropTask]);

  // Handle event move/resize
  const handleEventMouseDown = useCallback((
    e: React.MouseEvent,
    event: CalendarEvent,
    mode: 'move' | 'resize-top' | 'resize-bottom'
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const startY = e.clientY;
    const originalTop = timeToY(event.startTime);
    const originalHeight = timeToY(event.endTime) - originalTop;

    setDraggingEvent({ event, mode, startY, originalTop, originalHeight });
    setDragOffset({ top: 0, height: 0 });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingEvent) return;

    const deltaY = e.clientY - draggingEvent.startY;
    const snappedDelta = Math.round(deltaY / (HOUR_HEIGHT * SNAP_MINUTES / 60)) * (HOUR_HEIGHT * SNAP_MINUTES / 60);

    if (draggingEvent.mode === 'move') {
      setDragOffset({ top: snappedDelta, height: 0 });
    } else if (draggingEvent.mode === 'resize-top') {
      const maxDelta = draggingEvent.originalHeight - 30; // Minimum 30px height
      const clampedDelta = Math.min(snappedDelta, maxDelta);
      setDragOffset({ top: clampedDelta, height: -clampedDelta });
    } else if (draggingEvent.mode === 'resize-bottom') {
      const minDelta = -(draggingEvent.originalHeight - 30);
      const clampedDelta = Math.max(snappedDelta, minDelta);
      setDragOffset({ top: 0, height: clampedDelta });
    }
  }, [draggingEvent]);

  const handleMouseUp = useCallback(() => {
    if (!draggingEvent) return;

    const { event, mode, originalTop, originalHeight } = draggingEvent;

    let newTop = originalTop + dragOffset.top;
    let newHeight = originalHeight + dragOffset.height;

    // Clamp to valid range
    newTop = Math.max(0, Math.min(newTop, hours.length * HOUR_HEIGHT - newHeight));
    newHeight = Math.max(30, newHeight);

    const newStartTime = yToTime(newTop, selectedDate);
    const newEndTime = yToTime(newTop + newHeight, selectedDate);

    if (onEventMove && (dragOffset.top !== 0 || dragOffset.height !== 0)) {
      onEventMove(event.id, event.source, newStartTime, newEndTime);
    }

    setDraggingEvent(null);
    setDragOffset({ top: 0, height: 0 });
  }, [draggingEvent, dragOffset, hours.length, selectedDate, onEventMove]);

  // Format drop preview time
  const getDropPreviewTime = () => {
    if (dropPreviewY === null) return '';
    const time = yToTime(dropPreviewY, selectedDate);
    return format(time, 'h:mm a');
  };

  if (events.length === 0 && !isDraggingOver) {
    return (
      <div
        className="text-center py-12 text-gray-500 min-h-[400px] border-2 border-dashed border-gray-200 rounded-lg"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <p className="text-lg">No events scheduled for this day</p>
        <p className="text-sm mt-1">Drag a task here or add one from the sidebar</p>
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      className="space-y-4"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Timeline */}
      <div className="relative">
        {/* Hour grid */}
        {hours.map((hour, index) => {
          const isCurrentHour = hour === currentHour;

          return (
            <div
              key={hour}
              className={`flex border-t border-gray-100 ${
                isCurrentHour ? 'bg-blue-50/50' : ''
              }`}
              style={{ height: `${HOUR_HEIGHT}px` }}
            >
              <div className="w-20 flex-shrink-0 pr-4 py-2 text-right">
                <span
                  className={`text-sm ${
                    isCurrentHour ? 'font-semibold text-blue-600' : 'text-gray-500'
                  }`}
                >
                  {hourLabels[index]}
                </span>
              </div>
              <div className="flex-1" />
            </div>
          );
        })}

        {/* Events overlay - also serves as drop zone */}
        <div
          ref={containerRef}
          className={`absolute top-0 left-20 right-0 ${
            isDraggingOver ? 'bg-purple-50/30' : ''
          }`}
          style={{ height: `${hours.length * HOUR_HEIGHT}px` }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drop preview line */}
          {isDraggingOver && dropPreviewY !== null && (
            <div
              className="absolute left-0 right-0 flex items-center pointer-events-none z-50"
              style={{ top: `${dropPreviewY}px` }}
            >
              <div className="flex-1 h-0.5 bg-purple-500" />
              <span className="px-2 py-0.5 bg-purple-500 text-white text-xs rounded-full ml-2">
                {getDropPreviewTime()}
              </span>
            </div>
          )}

          {/* Current time indicator - red line */}
          {isToday && currentTimePosition >= 0 && currentTimePosition <= hours.length * HOUR_HEIGHT && (
            <div
              className="absolute left-0 right-0 z-20 pointer-events-none"
              style={{ top: `${currentTimePosition}px` }}
            >
              <div className="flex items-center">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1" />
                <div className="flex-1 h-0.5 bg-red-500" />
              </div>
            </div>
          )}

          {positionedEvents.map(pos => {
            const canDrag = pos.event.source === 'adhoc' || pos.event.source === 'asana' || pos.event.source === 'google';

            return (
              <div
                key={`${pos.event.integrationId || pos.event.source}-${pos.event.id}`}
                style={getEventStyle(pos)}
                className="group"
              >
                {/* Resize handle - top */}
                {canDrag && (
                  <div
                    className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize z-10 hover:bg-gray-400/20"
                    onMouseDown={(e) => handleEventMouseDown(e, pos.event, 'resize-top')}
                  />
                )}

                {/* Event card - mouse drag for vertical move within calendar */}
                <div
                  className={`h-full ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''}`}
                  onMouseDown={(e) => {
                    // Only trigger move if not clicking resize handles or other interactive elements
                    const target = e.target as HTMLElement;
                    if (!target.closest('.cursor-ns-resize') && !target.closest('button') && canDrag) {
                      handleEventMouseDown(e, pos.event, 'move');
                    }
                  }}
                >
                  <EventCard
                    event={pos.event}
                    compact
                    isPast={isEventPast(pos.event)}
                    onToggleComplete={
                      canDrag
                        ? () => onToggleComplete?.(pos.event.id, pos.event.source as 'adhoc' | 'asana')
                        : undefined
                    }
                    onDelete={pos.event.source === 'adhoc' ? onDeleteTask : undefined}
                    onUnschedule={
                      canDrag
                        ? () => onUnscheduleTask?.(pos.event.id, pos.event.source as 'adhoc' | 'asana')
                        : undefined
                    }
                    onDeleteEvent={onDeleteEvent ? () => onDeleteEvent(pos.event) : undefined}
                  />
                </div>

                {/* Resize handle - bottom */}
                {canDrag && (
                  <div
                    className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize z-10 hover:bg-gray-400/20"
                    onMouseDown={(e) => handleEventMouseDown(e, pos.event, 'resize-bottom')}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
