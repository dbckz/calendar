/**
 * Time attribution: the calendar is the source of truth. An event counts toward
 * the workspace whose calendar it sits on, however it got there — with explicit
 * task links and manual attributions taking precedence, and non-work entries
 * (all-day, declined, breaks, calendar furniture) excluded.
 */
import {
  attributeEventToWorkspace,
  attributeMinutes,
  buildWorkspaceCalendarMap,
  categoriseEvent,
  isCountableWorkEvent,
} from '@/lib/time-attribution';
import type { CalendarEvent } from '@/types';

// The live topology: the OM Asana workspace routes its events to the OM Google
// integration; DBC declares no routing, so no calendar is claimed for it.
const OM_ASANA = 'asana-om';
const DBC_ASANA = 'asana-dbc';
const OM_GOOGLE = 'google-om';
const PERSONAL_GOOGLE = 'google-personal';
const DBC_CALENDAR = 'davebuckleyconsulting@gmail.com';

const MAP = buildWorkspaceCalendarMap([
  { id: DBC_ASANA },
  { id: OM_ASANA, eventGoogleIntegrationId: OM_GOOGLE },
]);

const ctx = (over: Partial<Parameters<typeof attributeEventToWorkspace>[1]> = {}) => ({
  map: MAP,
  ...over,
});

const event = (over: Partial<CalendarEvent> & { id: string }): CalendarEvent => ({
  title: 'Some work',
  startTime: new Date(2026, 6, 24, 9, 0),
  endTime: new Date(2026, 6, 24, 10, 0),
  source: 'google',
  allDay: false,
  ...over,
});

describe('buildWorkspaceCalendarMap', () => {
  it('claims a calendar only where a workspace explicitly routes its events', () => {
    expect(MAP.byGoogleIntegration).toEqual({ [OM_GOOGLE]: OM_ASANA });
    // DBC has no routing, so the personal account is NOT claimed for it —
    // otherwise birthdays and family events would count as client work.
    expect(MAP.byGoogleIntegration[PERSONAL_GOOGLE]).toBeUndefined();
  });

  it('takes per-sub-calendar overrides for an account holding several workspaces', () => {
    const map = buildWorkspaceCalendarMap([{ id: OM_ASANA, eventGoogleIntegrationId: OM_GOOGLE }], {
      [DBC_CALENDAR]: DBC_ASANA,
    });
    expect(map.byCalendar[DBC_CALENDAR]).toBe(DBC_ASANA);
  });
});

describe('attributeEventToWorkspace', () => {
  it('counts a MANUAL event on the OM calendar toward OM', () => {
    const manual = event({ id: 'e-manual', title: 'Write the policy note', integrationId: OM_GOOGLE });
    expect(attributeEventToWorkspace(manual, ctx())).toBe(OM_ASANA);
  });

  it('counts a genuine OM meeting toward OM', () => {
    const meeting = event({
      id: 'e-meeting',
      title: 'Weekly sync with the team',
      integrationId: OM_GOOGLE,
      attendeeCount: 5,
      selfResponseStatus: 'accepted',
    });
    expect(isCountableWorkEvent(meeting)).toBe(true);
    expect(attributeEventToWorkspace(meeting, ctx())).toBe(OM_ASANA);
  });

  it('counts an OM-routed Emails ritual toward OM — app-created and hand-typed alike', () => {
    for (const title of ['📧 Emails', 'Emails', 'emails']) {
      const ritual = event({ id: `e-${title}`, title, integrationId: OM_GOOGLE });
      expect(isCountableWorkEvent(ritual)).toBe(true);
      expect(attributeEventToWorkspace(ritual, ctx())).toBe(OM_ASANA);
    }
  });

  it('counts an event on a mapped sub-calendar toward that workspace', () => {
    const map = buildWorkspaceCalendarMap([{ id: OM_ASANA, eventGoogleIntegrationId: OM_GOOGLE }], {
      [DBC_CALENDAR]: DBC_ASANA,
    });
    const consulting = event({
      id: 'e-dbc',
      title: 'Client call',
      integrationId: PERSONAL_GOOGLE,
      calendarId: DBC_CALENDAR,
    });
    expect(attributeEventToWorkspace(consulting, { map })).toBe(DBC_ASANA);
  });

  it('counts a personal-calendar event toward neither', () => {
    const personal = event({ id: 'e-life', title: 'Dentist', integrationId: PERSONAL_GOOGLE });
    expect(attributeEventToWorkspace(personal, ctx())).toBeNull();
  });

  describe('precedence', () => {
    it('an explicit task link wins over the calendar it sits on', () => {
      const linked = event({
        id: 'e-linked',
        title: 'DBC task parked on the OM calendar',
        integrationId: OM_GOOGLE,
        linkedAsanaTaskId: 'g1',
        linkedAsanaIntegrationId: DBC_ASANA,
      });
      expect(attributeEventToWorkspace(linked, ctx())).toBe(DBC_ASANA);
    });

    it('a manual attribution wins over the calendar but not over a task link', () => {
      const onOmCalendar = event({ id: 'e-attr', integrationId: OM_GOOGLE });
      const attributionByEventId = { 'e-attr': { asanaIntegrationId: DBC_ASANA } };
      expect(attributeEventToWorkspace(onOmCalendar, ctx({ attributionByEventId }))).toBe(DBC_ASANA);

      const linked = event({
        id: 'e-attr',
        integrationId: OM_GOOGLE,
        linkedAsanaIntegrationId: OM_ASANA,
      });
      expect(attributeEventToWorkspace(linked, ctx({ attributionByEventId }))).toBe(OM_ASANA);
    });

    it('an Asana-sourced event uses its own workspace', () => {
      const asanaEvent = event({ id: 'e-asana', source: 'asana', integrationId: DBC_ASANA });
      expect(attributeEventToWorkspace(asanaEvent, ctx())).toBe(DBC_ASANA);
    });
  });
});

describe('isCountableWorkEvent', () => {
  it('excludes all-day entries (which is also how reminders surface)', () => {
    expect(isCountableWorkEvent(event({ id: 'e', allDay: true }))).toBe(false);
  });

  it('excludes declined meetings, matching the planner treating them as free', () => {
    expect(isCountableWorkEvent(event({ id: 'e', selfResponseStatus: 'declined' }))).toBe(false);
    expect(isCountableWorkEvent(event({ id: 'e', selfResponseStatus: 'accepted' }))).toBe(true);
  });

  it('excludes breaks — lunch, exercise and break — however they are typed', () => {
    for (const title of ['🍽️ Lunch', 'Lunch', 'lunch', '🏋️ Exercise', 'Exercise', '☕ Break', 'Break']) {
      expect(isCountableWorkEvent(event({ id: 'e', title }))).toBe(false);
    }
  });

  it('keeps the WORK rituals — they are time spent working', () => {
    for (const title of ['📧 Emails', '📚 Kindle notes', '🧹 Backlog grooming', '🔄 Retrospective']) {
      expect(isCountableWorkEvent(event({ id: 'e', title }))).toBe(true);
    }
    // A real task whose title merely starts with a break word still counts.
    expect(isCountableWorkEvent(event({ id: 'e', title: 'Lunch with a funder' }))).toBe(true);
  });

  it('excludes calendar furniture and Gmail-derived reminders', () => {
    for (const eventType of ['birthday', 'workingLocation', 'fromGmail', 'outOfOffice']) {
      expect(isCountableWorkEvent(event({ id: 'e', eventType }))).toBe(false);
    }
    for (const eventType of ['default', 'focusTime']) {
      expect(isCountableWorkEvent(event({ id: 'e', eventType }))).toBe(true);
    }
  });

  it('excludes zero-length and malformed intervals', () => {
    const zero = event({ id: 'e', endTime: new Date(2026, 6, 24, 9, 0) });
    expect(isCountableWorkEvent(zero)).toBe(false);
  });
});

describe('attributeMinutes', () => {
  const NOON = new Date(2026, 6, 24, 12, 0).getTime();

  it('splits scheduled and worked minutes per workspace from one filter', () => {
    const events = [
      // OM meeting 09:00–10:00, fully elapsed by noon.
      event({ id: 'm1', title: 'OM sync', integrationId: OM_GOOGLE, attendeeCount: 3 }),
      // OM emails ritual 11:30–12:30: half elapsed at noon.
      event({
        id: 'm2',
        title: '📧 Emails',
        integrationId: OM_GOOGLE,
        startTime: new Date(2026, 6, 24, 11, 30),
        endTime: new Date(2026, 6, 24, 12, 30),
      }),
      // Lunch on the OM calendar: a break, so neither figure moves.
      event({
        id: 'm3',
        title: '🍽️ Lunch',
        integrationId: OM_GOOGLE,
        startTime: new Date(2026, 6, 24, 13, 0),
        endTime: new Date(2026, 6, 24, 13, 30),
      }),
      // Personal errand: counts toward neither.
      event({
        id: 'm4',
        title: 'School run',
        integrationId: PERSONAL_GOOGLE,
        startTime: new Date(2026, 6, 24, 8, 0),
        endTime: new Date(2026, 6, 24, 8, 30),
      }),
    ];

    const { scheduled, worked } = attributeMinutes(events, ctx(), NOON);
    expect(scheduled).toEqual({ [OM_ASANA]: 120 }); // 60 + 60
    expect(worked).toEqual({ [OM_ASANA]: 90 }); // 60 + 30 elapsed
    expect(scheduled[DBC_ASANA]).toBeUndefined();
  });

  it('reports a fully-elapsed past day as worked === scheduled', () => {
    const events = [event({ id: 'm1', title: 'OM work', integrationId: OM_GOOGLE })];
    const laterMs = new Date(2026, 6, 25, 9, 0).getTime();
    const { scheduled, worked } = attributeMinutes(events, ctx(), laterMs);
    expect(worked).toEqual(scheduled);
  });
});

describe('categoriseEvent', () => {
  it('reads an app block\'s category from the emoji convention the planner writes', () => {
    const cases: Array<[string, string]> = [
      ['✍️ Draft the brief', 'Writing/Deep Work'],
      ['🤝 Engagement / Outreach', 'Engagement/Outreach'],
      ['📦 Batch', 'Batch'],
      ['📝 Blog post', 'Blogs'],
      ['✅ General Todos', 'General Todos'],
    ];
    for (const [title, category] of cases) {
      expect(categoriseEvent(event({ id: 'e', title }), ctx())).toBe(category);
    }
  });

  it('gives each work ritual its own segment', () => {
    expect(categoriseEvent(event({ id: 'e', title: '📧 Emails' }), ctx())).toBe('Emails');
    expect(categoriseEvent(event({ id: 'e', title: 'Emails' }), ctx())).toBe('Emails');
    expect(categoriseEvent(event({ id: 'e', title: '📚 Kindle notes' }), ctx())).toBe('Kindle notes');
    expect(categoriseEvent(event({ id: 'e', title: '🔄 Retrospective' }), ctx())).toBe('Retrospective');
  });

  it('recognises meeting prep by its own prefix, legacy titles included', () => {
    expect(categoriseEvent(event({ id: 'e', title: '📖 Prep: Board' }), ctx())).toBe('Meeting prep');
    expect(categoriseEvent(event({ id: 'e', title: 'Prep: Board' }), ctx())).toBe('Meeting prep');
  });

  it('treats anything with an attendee list as a meeting', () => {
    expect(categoriseEvent(event({ id: 'e', title: 'Board sync', attendeeCount: 4 }), ctx())).toBe('Meetings');
    expect(categoriseEvent(event({ id: 'e', title: 'One-to-one', attendeeCount: 1 }), ctx())).toBe('Meetings');
  });

  it('prefers a linked task\'s real classification over the title emoji', () => {
    const linked = event({
      id: 'e',
      title: '✍️ Actually an outreach task',
      linkedAsanaTaskId: 'g1',
    });
    expect(categoriseEvent(linked, ctx({ categoryByTaskId: { g1: 'Engagement/Outreach' } }))).toBe(
      'Engagement/Outreach'
    );
  });

  it('falls back to the catch-all for an unmarked, attendee-less block', () => {
    expect(categoriseEvent(event({ id: 'e', title: 'Think about the thing' }), ctx())).toBe('Other');
  });
});

describe('overlap resolution', () => {
  const FUTURE = new Date(2026, 6, 25).getTime();

  it('counts overlapping time once, giving it to the meeting', () => {
    // A 2h task block with a 1h meeting dropped in the middle of it.
    const events = [
      event({
        id: 'block',
        title: '✍️ Deep work',
        integrationId: OM_GOOGLE,
        startTime: new Date(2026, 6, 24, 9, 0),
        endTime: new Date(2026, 6, 24, 11, 0),
      }),
      event({
        id: 'meeting',
        title: 'Interrupting meeting',
        integrationId: OM_GOOGLE,
        attendeeCount: 3,
        startTime: new Date(2026, 6, 24, 9, 30),
        endTime: new Date(2026, 6, 24, 10, 30),
      }),
    ];

    const { scheduled, scheduledByCategory, events: attributed } = attributeMinutes(events, ctx(), FUTURE);

    // Two hours passed, not three.
    expect(scheduled[OM_ASANA]).toBe(120);
    expect(scheduledByCategory[OM_ASANA]).toEqual({ Meetings: 60, 'Writing/Deep Work': 60 });
    // The block keeps only its uncovered halves.
    expect(attributed.find(e => e.eventId === 'block')).toMatchObject({
      fullMinutes: 120,
      countedMinutes: 60,
    });
    expect(attributed.find(e => e.eventId === 'meeting')).toMatchObject({ countedMinutes: 60 });
  });

  it('gives a task block precedence over a ritual it overlaps', () => {
    const events = [
      event({
        id: 'emails',
        title: '📧 Emails',
        integrationId: OM_GOOGLE,
        startTime: new Date(2026, 6, 24, 16, 0),
        endTime: new Date(2026, 6, 24, 16, 30),
      }),
      event({
        id: 'block',
        title: '✍️ Deep work',
        integrationId: OM_GOOGLE,
        startTime: new Date(2026, 6, 24, 16, 0),
        endTime: new Date(2026, 6, 24, 16, 30),
      }),
    ];

    const { scheduled, scheduledByCategory } = attributeMinutes(events, ctx(), FUTURE);
    expect(scheduled[OM_ASANA]).toBe(30);
    expect(scheduledByCategory[OM_ASANA]).toEqual({ 'Writing/Deep Work': 30 });
  });

  it('stacked category totals always sum to the workspace total', () => {
    const events = [
      event({ id: 'a', title: '✍️ A', integrationId: OM_GOOGLE, startTime: new Date(2026, 6, 24, 9, 0), endTime: new Date(2026, 6, 24, 10, 0) }),
      event({ id: 'b', title: 'Meeting', attendeeCount: 2, integrationId: OM_GOOGLE, startTime: new Date(2026, 6, 24, 9, 45), endTime: new Date(2026, 6, 24, 10, 15) }),
      event({ id: 'c', title: '📧 Emails', integrationId: OM_GOOGLE, startTime: new Date(2026, 6, 24, 10, 10), endTime: new Date(2026, 6, 24, 10, 40) }),
    ];

    const { scheduled, scheduledByCategory } = attributeMinutes(events, ctx(), FUTURE);
    const sum = Object.values(scheduledByCategory[OM_ASANA]).reduce((n, m) => n + m, 0);
    expect(sum).toBe(scheduled[OM_ASANA]);
    // 09:00–10:40 with no gaps = 100 minutes of real time.
    expect(scheduled[OM_ASANA]).toBe(100);
  });

  it('does not dedupe across workspaces — parallel calendars are separate time', () => {
    const map = buildWorkspaceCalendarMap([{ id: OM_ASANA, eventGoogleIntegrationId: OM_GOOGLE }], {
      [DBC_CALENDAR]: DBC_ASANA,
    });
    const events = [
      event({ id: 'om', title: 'OM meeting', attendeeCount: 2, integrationId: OM_GOOGLE }),
      event({ id: 'dbc', title: 'DBC call', attendeeCount: 2, integrationId: PERSONAL_GOOGLE, calendarId: DBC_CALENDAR }),
    ];
    const { scheduled } = attributeMinutes(events, { map }, FUTURE);
    expect(scheduled).toEqual({ [OM_ASANA]: 60, [DBC_ASANA]: 60 });
  });
});

describe('durable series / title attribution rules', () => {
  const FUTURE = new Date(2026, 6, 26).getTime();
  const LIFE_GOOGLE = 'google-life';
  const DBC_BUILT_IN = '29e78568-0681-4acc-b6b0-a7ffa9d31230';

  it('attributes "Weekly professional planning" to DBC wherever it sits', () => {
    // On no workspace-mapped calendar, so without the rule it counts toward nothing.
    const planning = event({
      id: 'planning-instance-1',
      title: 'Weekly professional planning',
      integrationId: LIFE_GOOGLE,
      recurringEventId: 'series-professional',
    });
    expect(attributeEventToWorkspace(planning, ctx())).toBe(DBC_BUILT_IN);

    // A different instance of the same series attributes identically — the point
    // of a rule over a per-event attribution.
    const nextWeek = event({
      id: 'planning-instance-2',
      title: 'Weekly professional planning',
      integrationId: LIFE_GOOGLE,
      recurringEventId: 'series-professional',
    });
    expect(attributeEventToWorkspace(nextWeek, ctx())).toBe(DBC_BUILT_IN);
  });

  it('is title-exact: "Weekly personal planning" is untouched', () => {
    const personal = event({
      id: 'personal-planning',
      title: 'Weekly personal planning',
      integrationId: LIFE_GOOGLE,
    });
    expect(attributeEventToWorkspace(personal, ctx())).toBeNull();

    // A superset title is not the rule either.
    const prep = event({
      id: 'prep',
      title: 'Weekly professional planning prep',
      integrationId: LIFE_GOOGLE,
    });
    expect(attributeEventToWorkspace(prep, ctx())).toBeNull();
  });

  it('matches a stored rule by series id, and lets it pin an event to nothing', () => {
    const rules = [
      {
        id: 'r1',
        recurringEventId: 'series-standup',
        asanaIntegrationId: 'none' as const,
        createdAt: '',
      },
    ];
    // On the OM calendar, so it would otherwise count as OM.
    const pinned = event({
      id: 'standup-1',
      title: 'Daily standup',
      integrationId: OM_GOOGLE,
      recurringEventId: 'series-standup',
      attendeeCount: 4,
    });
    expect(attributeEventToWorkspace(pinned, ctx({ attributionRules: rules }))).toBeNull();

    const { scheduled } = attributeMinutes([pinned], ctx({ attributionRules: rules }), FUTURE);
    expect(scheduled).toEqual({});
  });

  it('keeps a task link and a per-event attribution ahead of a rule', () => {
    const linked = event({
      id: 'planning-linked',
      title: 'Weekly professional planning',
      integrationId: LIFE_GOOGLE,
      linkedAsanaIntegrationId: OM_ASANA,
    });
    expect(attributeEventToWorkspace(linked, ctx())).toBe(OM_ASANA);

    const manual = event({ id: 'planning-manual', title: 'Weekly professional planning' });
    expect(
      attributeEventToWorkspace(
        manual,
        ctx({ attributionByEventId: { 'planning-manual': { asanaIntegrationId: OM_ASANA } } })
      )
    ).toBe(OM_ASANA);
  });

  it('still applies the exclusion rules first', () => {
    // An all-day "Weekly professional planning" is not a measurable slice of time.
    const allDay = event({ id: 'planning-allday', title: 'Weekly professional planning', allDay: true });
    expect(isCountableWorkEvent(allDay)).toBe(false);
    const { scheduled } = attributeMinutes([allDay], ctx(), FUTURE);
    expect(scheduled).toEqual({});
  });
});
