/**
 * Spotting the standing reminders parked on the calendar — the daily events
 * whose job is to nag rather than to occupy time.
 */
import { findCalendarReminders } from '@/lib/scheduling/calendar-reminders';
import type { CalendarEvent } from '@/types';

let seq = 0;
function event(
  title: string,
  date: string,
  overrides: Partial<CalendarEvent> = {}
): CalendarEvent {
  seq += 1;
  const start = new Date(`${date}T06:30:00`);
  return {
    id: `e${seq}`,
    title,
    startTime: start,
    endTime: new Date(start.getTime() + 15 * 60_000),
    source: 'google',
    ...overrides,
  } as CalendarEvent;
}

const WEEK = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07'];

describe('findCalendarReminders', () => {
  it('spots a short event repeating on most days of the week', () => {
    const events = WEEK.map(d => event('💰 $300k by EoY', d));
    const found = findCalendarReminders(events);

    expect(found).toHaveLength(1);
    expect(found[0].title).toBe('💰 $300k by EoY');
    expect(found[0].occurrences).toBe(5);
    expect(found[0].dates).toEqual(WEEK);
  });

  it('ignores something that only appears a couple of times', () => {
    const events = WEEK.slice(0, 2).map(d => event('Water plants', d));
    expect(findCalendarReminders(events)).toHaveLength(0);
  });

  it('ignores rituals, which are already scheduled deliberately', () => {
    const events = WEEK.map(d => event('🏋️ Exercise', d));
    expect(findCalendarReminders(events)).toHaveLength(0);
  });

  it('ignores personal commitments that recur', () => {
    // Footy and parkrun are things actually done at that time.
    expect(findCalendarReminders(WEEK.map(d => event('⚽ Footy', d)))).toHaveLength(0);
    expect(findCalendarReminders(WEEK.map(d => event('🏃 Parkrun', d)))).toHaveLength(0);
  });

  it('ignores a recurring MEETING, however often it repeats', () => {
    const events = WEEK.map(d => event('Standup', d, { attendeeCount: 6 }));
    expect(findCalendarReminders(events)).toHaveLength(0);
  });

  it('ignores a long recurring block — that is time genuinely set aside', () => {
    const events = WEEK.map(d =>
      event('Deep work', d, { endTime: new Date(`${d}T08:30:00`) })
    );
    expect(findCalendarReminders(events)).toHaveLength(0);
  });

  it('counts all-day reminders regardless of length', () => {
    const events = WEEK.map(d =>
      event('Chase the invoice', d, {
        allDay: true,
        endTime: new Date(`${d}T23:59:00`),
      })
    );
    const found = findCalendarReminders(events);
    expect(found).toHaveLength(1);
    expect(found[0].allDay).toBe(true);
  });

  it('counts distinct days, not occurrences, so a title twice a day is not inflated', () => {
    const events = [...WEEK.slice(0, 2).flatMap(d => [event('Nag', d), event('Nag', d)])];
    // Two days, four events — below the threshold.
    expect(findCalendarReminders(events)).toHaveLength(0);
  });

  it('ranks the most persistent nag first', () => {
    const found = findCalendarReminders([
      ...WEEK.map(d => event('Every day', d)),
      ...WEEK.slice(0, 4).map(d => event('Most days', d)),
    ]);
    expect(found.map(f => f.title)).toEqual(['Every day', 'Most days']);
  });
});
