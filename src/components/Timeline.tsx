'use client';

import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import { CalendarEvent, DragItem } from '@/types';
import { EventCard } from './EventCard';

interface TimelineProps {
  events: CalendarEvent[];
  selectedDate: Date;
  onDeleteTask?: (id: string) => void;
  onDropTask?: (dragItem: DragItem, startTime: Date, endTime: Date) => void;
  onEventMove?: (eventId: string, source: 'adhoc' | 'asana' | 'google', startTime: Date, endTime: Date) => void;
  onUnscheduleTask?: (eventId: string, source: 'adhoc' | 'asana') => void;
  onDeleteEvent?: (event: CalendarEvent) => void;
  onCreateTask?: (startTime: Date, endTime: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
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
const MIN_EVENT_HEIGHT = HOUR_HEIGHT * SNAP_MINUTES / 60; // 15px = 15 minutes

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
  onDeleteTask: _onDeleteTask,
  onDropTask,
  onEventMove,
  onUnscheduleTask: _onUnscheduleTask,
  onDeleteEvent,
  onCreateTask,
  onEventClick,
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

  // Click-and-drag task creation state
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [creationStartY, setCreationStartY] = useState<number | null>(null);
  const [creationEndY, setCreationEndY] = useState<number | null>(null);

  const hours = useMemo(() => {
    return Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => i + START_HOUR);
  }, []);

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }, [events]);

  const positionedEvents = useMemo(() => {
    return calculateEventPositions(sortedEvents);
  }, [sortedEvents]);

  // Pre-compute all event styles to avoid recalculating during render
  const eventStyles = useMemo(() => {
    const styles = new Map<string, React.CSSProperties>();

    for (const pos of positionedEvents) {
      const { event, column, totalColumns } = pos;
      const startHour = event.startTime.getHours() + event.startTime.getMinutes() / 60;
      const endHour = event.endTime.getHours() + event.endTime.getMinutes() / 60;

      const clampedStart = Math.max(startHour, START_HOUR);
      const clampedEnd = Math.min(endHour, END_HOUR + 1);

      const top = (clampedStart - START_HOUR) * HOUR_HEIGHT;
      const height = Math.max((clampedEnd - clampedStart) * HOUR_HEIGHT, MIN_EVENT_HEIGHT);

      const width = totalColumns > 1 ? `calc(${100 / totalColumns}% - 4px)` : 'calc(100% - 4px)';
      const left = totalColumns > 1 ? `calc(${(column * 100) / totalColumns}% + 2px)` : '2px';

      const eventKey = `${event.integrationId || event.source}-${event.id}`;
      styles.set(eventKey, {
        position: 'absolute' as const,
        top: `${top}px`,
        height: `${height}px`,
        left,
        width,
        zIndex: 1,
        opacity: 1,
      });
    }

    return styles;
  }, [positionedEvents]);

  // Current time for the indicator line - check if viewing today
  const isToday = useMemo(() => {
    const today = new Date();
    return selectedDate.toDateString() === today.toDateString();
  }, [selectedDate]);

  // Current time state - updates every minute
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60 * 1000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  // Current time position
  const currentTimePosition = useMemo(() => {
    const hours = currentTime.getHours() + currentTime.getMinutes() / 60;
    return (hours - START_HOUR) * HOUR_HEIGHT;
  }, [currentTime]);

  // Format current time as HH:mm (24 hour)
  const currentTimeLabel = useMemo(() => {
    return format(currentTime, 'HH:mm');
  }, [currentTime]);

  // Memoize current hour - updates with currentTime
  const currentHour = useMemo(() => currentTime.getHours(), [currentTime]);

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

  // Get event style with drag offsets applied when needed
  const getEventStyle = useCallback((pos: PositionedEvent): React.CSSProperties => {
    const { event } = pos;
    const eventKey = `${event.integrationId || event.source}-${event.id}`;
    const baseStyle = eventStyles.get(eventKey);

    if (!baseStyle) {
      return { position: 'absolute' as const };
    }

    // If this event is being dragged, apply offsets
    if (draggingEvent?.event.id === event.id) {
      const baseTop = parseFloat(baseStyle.top as string);
      const baseHeight = parseFloat(baseStyle.height as string);

      return {
        ...baseStyle,
        top: `${baseTop + dragOffset.top}px`,
        height: `${baseHeight + dragOffset.height}px`,
        zIndex: 100,
        opacity: 0.8,
      };
    }

    return baseStyle;
  }, [eventStyles, draggingEvent, dragOffset]);

  // Handle external drop (from sidebars)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Use 'copy' for templates, 'move' for other items
    e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed === 'copy' ? 'copy' : 'move';
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
        const duration = dragItem.duration || 30;
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
      const maxDelta = draggingEvent.originalHeight - MIN_EVENT_HEIGHT; // Minimum 15px height (15 min)
      const clampedDelta = Math.min(snappedDelta, maxDelta);
      setDragOffset({ top: clampedDelta, height: -clampedDelta });
    } else if (draggingEvent.mode === 'resize-bottom') {
      const minDelta = -(draggingEvent.originalHeight - MIN_EVENT_HEIGHT);
      const clampedDelta = Math.max(snappedDelta, minDelta);
      setDragOffset({ top: 0, height: clampedDelta });
    }
  }, [draggingEvent]);

  const handleMouseUp = useCallback(() => {
    if (!draggingEvent) return;

    const { event, mode: _mode, originalTop, originalHeight } = draggingEvent;

    let newTop = originalTop + dragOffset.top;
    let newHeight = originalHeight + dragOffset.height;

    // Clamp to valid range
    newTop = Math.max(0, Math.min(newTop, hours.length * HOUR_HEIGHT - newHeight));
    newHeight = Math.max(MIN_EVENT_HEIGHT, newHeight);

    const newStartTime = yToTime(newTop, selectedDate);
    const newEndTime = yToTime(newTop + newHeight, selectedDate);

    if (onEventMove && (dragOffset.top !== 0 || dragOffset.height !== 0)) {
      onEventMove(event.id, event.source, newStartTime, newEndTime);
    }

    setDraggingEvent(null);
    setDragOffset({ top: 0, height: 0 });
  }, [draggingEvent, dragOffset, hours.length, selectedDate, onEventMove]);

  // Format drop preview time - memoized
  const dropPreviewTime = useMemo(() => {
    if (dropPreviewY === null) return '';
    const time = yToTime(dropPreviewY, selectedDate);
    return format(time, 'h:mm a');
  }, [dropPreviewY, selectedDate]);

  // Check if a Y position overlaps with any existing event
  const doesOverlapWithEvents = useCallback((y: number, height: number = HOUR_HEIGHT / 2) => {
    const startTime = yToTime(y, selectedDate);
    const endTime = yToTime(y + height, selectedDate);

    return events.some(event =>
      startTime < event.endTime && endTime > event.startTime
    );
  }, [events, selectedDate]);

  // Handle click-and-drag task creation - mouse down on empty space
  const handleEmptySpaceMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start creation if clicking on empty space (not an event)
    if (!onCreateTask) return;
    if ((e.target as HTMLElement).closest('.event-card-wrapper')) return;

    // Don't start if we're dragging an event
    if (draggingEvent) return;

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const snappedY = Math.round(y / (HOUR_HEIGHT * SNAP_MINUTES / 60)) * (HOUR_HEIGHT * SNAP_MINUTES / 60);

      // Check if this position overlaps with an event
      if (doesOverlapWithEvents(snappedY)) return;

      setIsCreatingEvent(true);
      setCreationStartY(snappedY);
      setCreationEndY(snappedY + (HOUR_HEIGHT / 2)); // Default 30 min
    }
  }, [onCreateTask, draggingEvent, doesOverlapWithEvents]);

  // Handle creation mouse move
  const handleCreationMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isCreatingEvent || creationStartY === null) return;

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const snappedY = Math.round(y / (HOUR_HEIGHT * SNAP_MINUTES / 60)) * (HOUR_HEIGHT * SNAP_MINUTES / 60);

      // Clamp to valid range
      const clampedY = Math.max(0, Math.min(snappedY, hours.length * HOUR_HEIGHT));

      // Ensure minimum height of 15 minutes
      const minHeight = MIN_EVENT_HEIGHT;
      if (clampedY >= creationStartY) {
        setCreationEndY(Math.max(clampedY, creationStartY + minHeight));
      } else {
        setCreationEndY(creationStartY + minHeight);
        setCreationStartY(Math.min(clampedY, creationStartY - minHeight));
      }
    }
  }, [isCreatingEvent, creationStartY, hours.length]);

  // Handle creation mouse up
  const handleCreationMouseUp = useCallback(() => {
    if (!isCreatingEvent || creationStartY === null || creationEndY === null) {
      setIsCreatingEvent(false);
      setCreationStartY(null);
      setCreationEndY(null);
      return;
    }

    const startY = Math.min(creationStartY, creationEndY);
    const endY = Math.max(creationStartY, creationEndY);

    const startTime = yToTime(startY, selectedDate);
    const endTime = yToTime(endY, selectedDate);

    // Only trigger if we have a valid selection (at least 15 minutes)
    if (endTime.getTime() - startTime.getTime() >= 15 * 60 * 1000) {
      onCreateTask?.(startTime, endTime);
    }

    setIsCreatingEvent(false);
    setCreationStartY(null);
    setCreationEndY(null);
  }, [isCreatingEvent, creationStartY, creationEndY, selectedDate, onCreateTask]);

  // Creation preview box
  const creationPreview = useMemo(() => {
    if (!isCreatingEvent || creationStartY === null || creationEndY === null) return null;

    const top = Math.min(creationStartY, creationEndY);
    const height = Math.abs(creationEndY - creationStartY);

    const startTime = yToTime(top, selectedDate);
    const endTime = yToTime(top + height, selectedDate);

    return {
      top,
      height,
      startLabel: format(startTime, 'h:mm a'),
      endLabel: format(endTime, 'h:mm a'),
    };
  }, [isCreatingEvent, creationStartY, creationEndY, selectedDate]);

  // Combined mouse move handler
  const handleCombinedMouseMove = useCallback((e: React.MouseEvent) => {
    if (draggingEvent) {
      handleMouseMove(e);
    } else if (isCreatingEvent) {
      handleCreationMouseMove(e);
    }
  }, [draggingEvent, handleMouseMove, isCreatingEvent, handleCreationMouseMove]);

  // Combined mouse up handler
  const handleCombinedMouseUp = useCallback(() => {
    if (draggingEvent) {
      handleMouseUp();
    } else if (isCreatingEvent) {
      handleCreationMouseUp();
    }
  }, [draggingEvent, handleMouseUp, isCreatingEvent, handleCreationMouseUp]);

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
      onMouseMove={handleCombinedMouseMove}
      onMouseUp={handleCombinedMouseUp}
      onMouseLeave={handleCombinedMouseUp}
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

        {/* Events overlay - also serves as drop zone and creation area */}
        <div
          ref={containerRef}
          className={`absolute top-0 left-20 right-0 ${
            isDraggingOver ? 'bg-purple-50/30' : ''
          } ${onCreateTask ? 'cursor-crosshair' : ''}`}
          style={{ height: `${hours.length * HOUR_HEIGHT}px` }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onMouseDown={handleEmptySpaceMouseDown}
        >
          {/* Drop preview line */}
          {isDraggingOver && dropPreviewY !== null && (
            <div
              className="absolute left-0 right-0 flex items-center pointer-events-none z-50"
              style={{ top: `${dropPreviewY}px` }}
            >
              <div className="flex-1 h-0.5 bg-purple-500" />
              <span className="px-2 py-0.5 bg-purple-500 text-white text-xs rounded-full ml-2">
                {dropPreviewTime}
              </span>
            </div>
          )}

          {/* Current time indicator - red line with time label */}
          {isToday && currentTimePosition >= 0 && currentTimePosition <= hours.length * HOUR_HEIGHT && (
            <div
              className="absolute z-20 pointer-events-none"
              style={{ top: `${currentTimePosition}px`, left: '-80px', right: '0' }}
            >
              <div className="flex items-center">
                <span className="text-xs font-medium text-red-500 w-[70px] text-right pr-2">
                  {currentTimeLabel}
                </span>
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1" />
                <div className="flex-1 h-0.5 bg-red-500" />
              </div>
            </div>
          )}

          {/* Creation preview box */}
          {creationPreview && (
            <div
              className="absolute left-1 right-1 bg-purple-500/20 border-2 border-purple-500 border-dashed rounded-lg pointer-events-none z-40"
              style={{
                top: `${creationPreview.top}px`,
                height: `${creationPreview.height}px`,
              }}
            >
              <div className="absolute -top-5 left-2 px-2 py-0.5 bg-purple-500 text-white text-xs rounded">
                {creationPreview.startLabel}
              </div>
              <div className="absolute -bottom-5 left-2 px-2 py-0.5 bg-purple-500 text-white text-xs rounded">
                {creationPreview.endLabel}
              </div>
            </div>
          )}

          {positionedEvents.map(pos => {
            const canDrag = pos.event.source === 'adhoc' || pos.event.source === 'asana' || pos.event.source === 'google';
            const eventStyle = getEventStyle(pos);
            const eventHeight = parseFloat(String(eventStyle.height || '0'));
            // For small events, hide top resize handle (overlaps delete button) but keep bottom handle for lengthening
            const showTopResizeHandle = canDrag && eventHeight > 25;
            const showBottomResizeHandle = canDrag;

            return (
              <div
                key={`${pos.event.integrationId || pos.event.source}-${pos.event.id}`}
                style={eventStyle}
                className="group event-card-wrapper"
              >
                {/* Resize handle - top (only for larger events to avoid overlapping delete button) */}
                {showTopResizeHandle && (
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
                  onClick={(e) => {
                    // Trigger event click to highlight in sidebar (only if not dragging)
                    if (!draggingEvent && onEventClick) {
                      e.stopPropagation();
                      onEventClick(pos.event);
                    }
                  }}
                >
                  <EventCard
                    event={pos.event}
                    compact
                    isPast={isEventPast(pos.event)}
                    height={eventHeight}
                    onDeleteEvent={onDeleteEvent ? () => onDeleteEvent(pos.event) : undefined}
                  />
                </div>

                {/* Resize handle - bottom (always shown for lengthening events) */}
                {showBottomResizeHandle && (
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
