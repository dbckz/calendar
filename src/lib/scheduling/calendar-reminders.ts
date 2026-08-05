// Finding the standing reminders parked on the calendar.
//
// Some things live on the calendar as a daily recurring event whose job is to
// nag rather than to occupy time — "💰 $300k by EoY" at 06:30 every morning,
// "🙏 MPs - gratitude". They are never done at the time they sit at, they clog
// every day's agenda, and the actual work they point at never gets planned.
//
// This spots them so the plan-my-week wizard can offer to turn one into a real
// task and schedule it once, properly.
//
// Pure and I/O-free, like the rest of scheduling/: events in, candidates out.

import type { CalendarEvent } from '@/types';
import { isPersonalLikeTitle, isRitualLikeTitle } from './rituals';

export interface CalendarReminderCandidate {
  title: string;
  // Distinct dates the title appears on within the window.
  occurrences: number;
  // Every date it appears on, earliest first — shown so the pattern is visible.
  dates: string[];
  // The id of one occurrence, so the caller can look the event up.
  sampleEventId: string;
  allDay: boolean;
  durationMinutes?: number;
}

// How many days in the window a title must appear on before it reads as a
// standing reminder rather than a real recurring commitment. Four of a five-day
// working week: a genuinely daily nag, not a Tuesday stand-up.
const MIN_OCCURRENCES = 4;

// Above this, a recurring event is a real commitment (a class, a standing
// meeting) rather than a reminder — it occupies the time it claims.
const MAX_DURATION_MINUTES = 30;

function normalise(title: string): string {
  return title.trim().toLowerCase();
}

// Meetings are commitments, not reminders — anything with other people in it is
// excluded however often it recurs.
function looksLikeMeeting(event: CalendarEvent): boolean {
  return (event.attendeeCount ?? 0) > 1;
}

export function findCalendarReminders(
  events: CalendarEvent[],
  options: { minOccurrences?: number } = {}
): CalendarReminderCandidate[] {
  const minOccurrences = options.minOccurrences ?? MIN_OCCURRENCES;
  const byTitle = new Map<
    string,
    { title: string; dates: Set<string>; sampleEventId: string; allDay: boolean; durationMinutes?: number }
  >();

  for (const event of events) {
    const title = event.title?.trim();
    if (!title) continue;

    // Rituals are already scheduled deliberately; personal markers (footy, a
    // cycle, a parkrun) are commitments, not reminders. Both would otherwise
    // dominate this list — they are exactly the things that recur daily.
    if (isRitualLikeTitle(title) || isPersonalLikeTitle(title)) continue;
    if (looksLikeMeeting(event)) continue;

    const durationMinutes =
      (event.endTime.getTime() - event.startTime.getTime()) / 60_000;
    const allDay = !!event.allDay;
    // A long block is time actually set aside, not a nag.
    if (!allDay && durationMinutes > MAX_DURATION_MINUTES) continue;

    const key = normalise(title);
    const date = localDate(event.startTime);
    const existing = byTitle.get(key);
    if (existing) {
      existing.dates.add(date);
    } else {
      byTitle.set(key, {
        title,
        dates: new Set([date]),
        sampleEventId: event.id,
        allDay,
        ...(allDay ? {} : { durationMinutes }),
      });
    }
  }

  return [...byTitle.values()]
    .filter(entry => entry.dates.size >= minOccurrences)
    .map(entry => ({
      title: entry.title,
      occurrences: entry.dates.size,
      dates: [...entry.dates].sort(),
      sampleEventId: entry.sampleEventId,
      allDay: entry.allDay,
      ...(entry.durationMinutes !== undefined
        ? { durationMinutes: Math.round(entry.durationMinutes) }
        : {}),
    }))
    // Most persistent first — the one nagging every single day is the one most
    // worth converting.
    .sort((a, b) => b.occurrences - a.occurrences || a.title.localeCompare(b.title));
}

function localDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
