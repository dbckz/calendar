import { isEventOnDate, mergeEventsForDate } from '@/lib/event-merge';
import { CalendarEvent, ScheduledAsanaTask } from '@/types';
import { createMockCalendarEvent } from '../mocks/data';

const schedule = (overrides: Partial<ScheduledAsanaTask> = {}): ScheduledAsanaTask => ({
  id: 'schedule-1',
  asanaTaskId: 'asana-task-1',
  integrationId: 'integration-1',
  scheduledDate: '2024-01-15',
  scheduledTime: '09:00',
  duration: 60,
  ...overrides,
});

const emptyInputs = {
  googleEvents: [] as CalendarEvent[],
  scheduledAsanaTasks: [] as ScheduledAsanaTask[],
  adhocEvents: [] as CalendarEvent[],
  scheduledAsanaEvents: [] as CalendarEvent[],
};

describe('isEventOnDate', () => {
  it('matches a timed event by its start date', () => {
    const event = createMockCalendarEvent({
      startTime: new Date('2024-01-15T09:00:00'),
      endTime: new Date('2024-01-15T10:00:00'),
    });
    expect(isEventOnDate(event, '2024-01-15')).toBe(true);
    expect(isEventOnDate(event, '2024-01-16')).toBe(false);
  });

  it('treats the all-day end date as exclusive', () => {
    const event = createMockCalendarEvent({
      allDay: true,
      startTime: new Date('2024-01-15T00:00:00'),
      endTime: new Date('2024-01-17T00:00:00'),
    });
    expect(isEventOnDate(event, '2024-01-15')).toBe(true);
    expect(isEventOnDate(event, '2024-01-16')).toBe(true);
    expect(isEventOnDate(event, '2024-01-17')).toBe(false);
  });
});

describe('mergeEventsForDate', () => {
  it('links a Google event to its scheduled Asana task via googleEventId', () => {
    const google = createMockCalendarEvent({ id: 'google-event-1' });
    const result = mergeEventsForDate('2024-01-15', {
      ...emptyInputs,
      googleEvents: [google],
      scheduledAsanaTasks: [schedule({ googleEventId: 'google-event-1' })],
    });

    expect(result).toHaveLength(1);
    expect(result[0].linkedAsanaTaskId).toBe('asana-task-1');
    expect(result[0].linkedAsanaIntegrationId).toBe('integration-1');
    expect(result[0].color).toBe('#f06a6a');
  });

  it('links via a single Asana task URL in the description', () => {
    const google = createMockCalendarEvent({
      id: 'g1',
      description: 'See https://app.asana.com/0/0/12345/f',
      color: '#4285f4',
    });
    const result = mergeEventsForDate('2024-01-15', {
      ...emptyInputs,
      googleEvents: [google],
    });

    expect(result[0].linkedAsanaTaskId).toBe('12345');
    expect(result[0].linkedAsanaIntegrationId).toBeUndefined();
    expect(result[0].color).toBe('#4285f4');
  });

  it('does not link when the description references several tasks', () => {
    const google = createMockCalendarEvent({
      id: 'g1',
      description: 'https://app.asana.com/0/0/111/f and https://app.asana.com/0/0/222/f',
    });
    const result = mergeEventsForDate('2024-01-15', {
      ...emptyInputs,
      googleEvents: [google],
    });

    expect(result[0].linkedAsanaTaskId).toBeUndefined();
  });

  it('links by unambiguous title match, tolerating an emoji prefix', () => {
    const google = createMockCalendarEvent({ id: 'g1', title: '🎯 Write report', description: undefined });
    const task = createMockCalendarEvent({ id: 'task-9', title: 'Write report', source: 'asana', completed: false });
    const result = mergeEventsForDate('2024-01-15', {
      ...emptyInputs,
      googleEvents: [google],
      allAsanaTasks: [task],
    });

    expect(result[0].linkedAsanaTaskId).toBe('task-9');
  });

  it('does not link an ambiguous title match', () => {
    const google = createMockCalendarEvent({ id: 'g1', title: 'Write report', description: undefined });
    const tasks = [
      createMockCalendarEvent({ id: 'task-1', title: 'Write report', source: 'asana', completed: false }),
      createMockCalendarEvent({ id: 'task-2', title: 'Write report', source: 'asana', completed: false }),
    ];
    const result = mergeEventsForDate('2024-01-15', {
      ...emptyInputs,
      googleEvents: [google],
      allAsanaTasks: tasks,
    });

    expect(result[0].linkedAsanaTaskId).toBeUndefined();
  });

  it('ignores completed tasks for title matching', () => {
    const google = createMockCalendarEvent({ id: 'g1', title: 'Write report', description: undefined });
    const task = createMockCalendarEvent({ id: 'task-1', title: 'Write report', source: 'asana', completed: true });
    const result = mergeEventsForDate('2024-01-15', {
      ...emptyInputs,
      googleEvents: [google],
      allAsanaTasks: [task],
    });

    expect(result[0].linkedAsanaTaskId).toBeUndefined();
  });

  it('excludes scheduled-Asana events whose schedule is linked to a Google event', () => {
    const linkedScheduleEvent = createMockCalendarEvent({ id: 'schedule-linked', source: 'asana' });
    const standaloneScheduleEvent = createMockCalendarEvent({ id: 'schedule-standalone', source: 'asana' });
    const result = mergeEventsForDate('2024-01-15', {
      ...emptyInputs,
      scheduledAsanaTasks: [
        schedule({ id: 'schedule-linked', googleEventId: 'google-event-1' }),
        schedule({ id: 'schedule-standalone', asanaTaskId: 'asana-task-2' }),
      ],
      scheduledAsanaEvents: [linkedScheduleEvent, standaloneScheduleEvent],
    });

    expect(result.map(e => e.id)).toEqual(['schedule-standalone']);
  });

  it('appends adhoc events and filters Google events to the date', () => {
    const onDate = createMockCalendarEvent({ id: 'on-date' });
    const offDate = createMockCalendarEvent({
      id: 'off-date',
      startTime: new Date('2024-01-16T09:00:00'),
      endTime: new Date('2024-01-16T10:00:00'),
    });
    const adhoc = createMockCalendarEvent({ id: 'adhoc-1', source: 'adhoc' });
    const result = mergeEventsForDate('2024-01-15', {
      ...emptyInputs,
      googleEvents: [onDate, offDate],
      adhocEvents: [adhoc],
    });

    expect(result.map(e => e.id)).toEqual(['on-date', 'adhoc-1']);
  });
});
