// Convert fetched calendar events into merged busy intervals for the scheduler.
//
// All-day events are intentionally NOT treated as busy: the app renders them in
// a separate AllDayEventsBar (see src/components/AllDayEventsBar.tsx) rather than
// occupying timeline slots, so an all-day event (e.g. "Alice's birthday") should
// not block auto-scheduling of focus blocks that day. Only timed events count.

import type { BusyInterval } from './types';
import { isBreakTitle } from './rituals';

// Minimal shape we need from a calendar event. Compatible with CalendarEvent
// (startTime/endTime as Date) but accepts strings/Dates defensively.
export interface EventLike {
  title?: string;
  startTime: Date | string;
  endTime: Date | string;
  allDay?: boolean;
  // The user's own RSVP. A 'declined' event is free time — the user isn't
  // attending — so it must not block scheduling.
  selfResponseStatus?: string;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

// Merge overlapping or touching intervals into a minimal sorted set.
export function mergeIntervals(intervals: BusyInterval[]): BusyInterval[] {
  const valid = intervals
    .filter(i => i.end.getTime() > i.start.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const merged: BusyInterval[] = [];
  for (const interval of valid) {
    const last = merged[merged.length - 1];
    if (last && interval.start.getTime() <= last.end.getTime()) {
      // Overlapping or adjacent (touching) -> extend the previous interval.
      if (interval.end.getTime() > last.end.getTime()) {
        last.end = interval.end;
      }
    } else {
      merged.push({ start: interval.start, end: interval.end });
    }
  }
  return merged;
}

// Build merged busy intervals from calendar events, dropping all-day events.
// Events titled exactly like a break ritual ("🍽️ Lunch" / "🏋️ Exercise") are
// tagged as BREAK intervals and merged separately from work intervals, so a break
// never merges into an adjacent meeting and keeps splitting work runs. (Emails
// counts as work.)
export function eventsToBusyIntervals(events: EventLike[]): BusyInterval[] {
  const work: BusyInterval[] = [];
  const breaks: BusyInterval[] = [];
  for (const event of events) {
    if (event.allDay) continue;
    if (event.selfResponseStatus === 'declined') continue; // declined → free time
    const start = toDate(event.startTime);
    const end = toDate(event.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    if (end.getTime() <= start.getTime()) continue;
    (event.title && isBreakTitle(event.title) ? breaks : work).push({ start, end });
  }
  const mergedBreaks = mergeIntervals(breaks).map(i => ({ ...i, isBreak: true }));
  return [...mergeIntervals(work), ...mergedBreaks];
}
