import { selectCalendarReviewBlocks, stripLeadingEmoji, type AsanaMatchTask } from '@/lib/scheduling/calendar-review';
import type { CalendarEvent } from '@/types';

// Fixed "now" late on 2026-07-21 so a 14:00 event has ended but a 20:00 one hasn't.
const NOW = new Date(2026, 6, 21, 18, 0, 0).getTime();
const inWeek = (d: string) => d >= '2026-07-20' && d <= '2026-07-26';

function event(overrides: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return {
    title: 'Some event',
    startTime: new Date(2026, 6, 21, 14, 0, 0),
    endTime: new Date(2026, 6, 21, 14, 45, 0),
    source: 'google',
    allDay: false,
    integrationId: 'g-int1',
    ...overrides,
  };
}

function run(events: CalendarEvent[], opts: Partial<Parameters<typeof selectCalendarReviewBlocks>[0]> = {}) {
  return selectCalendarReviewBlocks({
    events,
    appEventIds: new Set(),
    ritualTitles: new Set(['🍽️ Lunch']),
    nowMs: NOW,
    inWeek,
    doneOverrides: {},
    asanaTasks: [],
    ...opts,
  });
}

describe('selectCalendarReviewBlocks', () => {
  it('selects a solo timed event that has ended this week', () => {
    const out = run([event({ id: 'e1', title: 'Draft memo' })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      googleEventId: 'e1',
      source: 'calendar',
      date: '2026-07-21',
      start: '14:00',
      durationMinutes: 45,
      done: false,
      titles: ['Draft memo'],
    });
    expect(out[0].tasks[0].gid).toBeUndefined();
  });

  it('skips all-day events', () => {
    expect(run([event({ id: 'e1', allDay: true })])).toHaveLength(0);
  });

  it('skips events already owned by a local record', () => {
    expect(run([event({ id: 'e1' })], { appEventIds: new Set(['e1']) })).toHaveLength(0);
  });

  it('skips meetings (2+ attendees) but keeps self-only / no-attendee events', () => {
    const out = run([
      event({ id: 'meeting', attendeeCount: 3 }),
      event({ id: 'solo', attendeeCount: 1 }),
      event({ id: 'owned' }), // attendeeCount undefined
    ]);
    expect(out.map(b => b.googleEventId).sort()).toEqual(['owned', 'solo']);
  });

  it('skips events that have not ended yet', () => {
    const later = event({
      id: 'e1',
      startTime: new Date(2026, 6, 21, 20, 0, 0),
      endTime: new Date(2026, 6, 21, 21, 0, 0),
    });
    expect(run([later])).toHaveLength(0);
  });

  it('skips events outside the reviewed week', () => {
    const lastWeek = event({
      id: 'e1',
      startTime: new Date(2026, 6, 14, 14, 0, 0),
      endTime: new Date(2026, 6, 14, 14, 45, 0),
    });
    expect(run([lastWeek])).toHaveLength(0);
  });

  it('skips manually-added ritual events by title', () => {
    expect(run([event({ id: 'e1', title: '🍽️ Lunch' })])).toHaveLength(0);
  });

  it('skips titles the user dismissed as "not a task"', () => {
    const out = run([
      event({ id: 'e1', title: '300k review' }),
      event({ id: 'e2', title: 'Draft memo' }),
    ], { dismissedTitles: new Set(['300k review']) });
    expect(out.map(b => b.googleEventId)).toEqual(['e2']);
  });

  it('skips events that ended before the review window start', () => {
    // Event ends 14:45; a reviewStart at 16:00 excludes it.
    const reviewStartMs = new Date(2026, 6, 21, 16, 0, 0).getTime();
    expect(run([event({ id: 'e1' })], { reviewStartMs })).toHaveLength(0);
  });

  it('keeps events that ended after the review window start', () => {
    const reviewStartMs = new Date(2026, 6, 21, 10, 0, 0).getTime();
    expect(run([event({ id: 'e1' })], { reviewStartMs })).toHaveLength(1);
  });

  it('pre-ticks an event with a done override', () => {
    const out = run([event({ id: 'e1' })], { doneOverrides: { e1: true } });
    expect(out[0].done).toBe(true);
    expect(out[0].tasks[0].done).toBe(true);
  });

  it('matches an incomplete Asana task by a single description URL', () => {
    const tasks: AsanaMatchTask[] = [{ gid: '111', name: 'Anything', integrationId: 'int1' }];
    const out = run(
      [event({ id: 'e1', description: 'notes https://app.asana.com/0/0/111/f more' })],
      { asanaTasks: tasks }
    );
    expect(out[0].tasks[0]).toMatchObject({ gid: '111', integrationId: 'int1' });
  });

  it('matches an incomplete Asana task by title, tolerating an emoji prefix', () => {
    const tasks: AsanaMatchTask[] = [{ gid: '222', name: 'Review PRs', integrationId: 'int1' }];
    const out = run([event({ id: 'e1', title: '🎯 Review PRs' })], { asanaTasks: tasks });
    expect(out[0].tasks[0]).toMatchObject({ gid: '222', integrationId: 'int1' });
  });

  it('does not match when the title is ambiguous (two tasks share it)', () => {
    const tasks: AsanaMatchTask[] = [
      { gid: '1', name: 'Review PRs', integrationId: 'int1' },
      { gid: '2', name: 'Review PRs', integrationId: 'int1' },
    ];
    const out = run([event({ id: 'e1', title: 'Review PRs' })], { asanaTasks: tasks });
    expect(out[0].tasks[0].gid).toBeUndefined();
  });
});

describe('stripLeadingEmoji', () => {
  it('removes a single leading emoji prefix', () => {
    expect(stripLeadingEmoji('🎯 Focus block')).toBe('Focus block');
    expect(stripLeadingEmoji('📧 Emails')).toBe('Emails');
  });
  it('leaves a plain title untouched', () => {
    expect(stripLeadingEmoji('Write the report')).toBe('Write the report');
  });
});
