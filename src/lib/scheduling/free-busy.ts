// Convert fetched calendar events into merged busy intervals for the scheduler.
//
// All-day events are intentionally NOT treated as busy: the app renders them in
// a separate AllDayEventsBar (see src/components/AllDayEventsBar.tsx) rather than
// occupying timeline slots, so an all-day event (e.g. "Alice's birthday") should
// not block auto-scheduling of focus blocks that day. Only timed events count.

import type { BusyInterval } from './types';
import { isBreakTitle, isRitualLikeTitle } from './rituals';
import { categoryForTitleEmoji, isPrepTitle } from './event-titles';

// Minimal shape we need from a calendar event. Compatible with CalendarEvent
// (startTime/endTime as Date) but accepts strings/Dates defensively.
export interface EventLike {
  id?: string;
  title?: string;
  startTime: Date | string;
  endTime: Date | string;
  allDay?: boolean;
  // The user's own RSVP. A 'declined' event is free time — the user isn't
  // attending — so it must not block scheduling.
  selfResponseStatus?: string;
  // Google's free/busy flag. 'transparent' = shown as FREE; scheduling skips it
  // (unless it's an app-created block — see isAppCreatedEvent).
  transparency?: 'opaque' | 'transparent';
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

// Is this event one the planner itself created? Such blocks are written with
// transparency 'transparent' on the OM calendar (so they don't clutter Dave's
// free/busy for others) yet MUST still count as busy for scheduling. We identify
// them two ways: the event id is in `appEventIds` (the stored prep/ritual/task
// records' Google event ids), OR the title matches an app convention — a ritual/
// break/prep title, or a category-emoji-prefixed task/grouped/reserved block.
export function isAppCreatedEvent(event: EventLike, appEventIds?: Set<string>): boolean {
  if (event.id && appEventIds?.has(event.id)) return true;
  const title = event.title;
  if (!title) return false;
  return isRitualLikeTitle(title) || isPrepTitle(title) || categoryForTitleEmoji(title) !== null;
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

// A calendar event marks a day OUT OF OFFICE when Google typed it as such
// (eventType 'outOfOffice' — how Dave's "🌴 Out of office" events come back, even
// though they're stored as a timed 00:00–24:00 block), or it's an all-day event
// whose title reads as OOO ("out of office" / "OOO" / 🌴) for calendars that don't
// set the type. A shape with just the fields we need, compatible with CalendarEvent.
export interface OOOEventLike {
  eventType?: string;
  title?: string;
  allDay?: boolean;
  startTime: Date | string;
  endTime: Date | string;
}

const OOO_TITLE_RE = /out\s*of\s*office|\bOOO\b|🌴/i;

function isOutOfOfficeEvent(e: OOOEventLike): boolean {
  if (e.eventType === 'outOfOffice') return true;
  return !!e.allDay && !!e.title && OOO_TITLE_RE.test(e.title);
}

// Given the week's events and the candidate working days (each with its
// working-hours window), return the set of working-day dates (yyyy-MM-dd) that are
// OUT OF OFFICE: an OOO event that covers the whole working window that day (an
// all-day OOO event always counts; a timed OOO must span whStart→whEnd). A
// half-day OOO does not remove the day.
export function outOfOfficeDates(
  events: OOOEventLike[],
  workingDays: Array<{ dateStr: string; whStartMs: number; whEndMs: number }>
): Set<string> {
  const ooo = events
    .filter(isOutOfOfficeEvent)
    .map(e => ({
      start: toDate(e.startTime).getTime(),
      end: toDate(e.endTime).getTime(),
      allDay: !!e.allDay,
    }))
    .filter(e => e.end > e.start);
  const out = new Set<string>();
  for (const wd of workingDays) {
    for (const e of ooo) {
      const covers = e.allDay
        ? e.start <= wd.whStartMs && e.end > wd.whStartMs
        : e.start <= wd.whStartMs && e.end >= wd.whEndMs;
      if (covers) {
        out.add(wd.dateStr);
        break;
      }
    }
  }
  return out;
}

// Build merged busy intervals from calendar events, dropping all-day events.
// Events titled exactly like a break ritual ("🍽️ Lunch" / "🏋️ Exercise") are
// tagged as BREAK intervals and merged separately from work intervals, so a break
// never merges into an adjacent meeting and keeps splitting work runs. (Emails
// counts as work.)
//
// Events the user has marked FREE (transparency 'transparent') are skipped — they
// don't block scheduling — EXCEPT app-created blocks (identified by stored event
// id in `appEventIds` or by title convention), which the planner writes transparent
// yet must keep as busy time.
export function eventsToBusyIntervals(
  events: EventLike[],
  appEventIds?: Set<string>
): BusyInterval[] {
  const work: BusyInterval[] = [];
  const breaks: BusyInterval[] = [];
  for (const event of events) {
    if (event.allDay) continue;
    if (event.selfResponseStatus === 'declined') continue; // declined → free time
    // Marked-free events are free time, unless it's one of our own blocks.
    if (event.transparency === 'transparent' && !isAppCreatedEvent(event, appEventIds)) continue;
    const start = toDate(event.startTime);
    const end = toDate(event.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    if (end.getTime() <= start.getTime()) continue;
    (event.title && isBreakTitle(event.title) ? breaks : work).push({ start, end });
  }
  const mergedBreaks = mergeIntervals(breaks).map(i => ({ ...i, isBreak: true }));
  return [...mergeIntervals(work), ...mergedBreaks];
}
