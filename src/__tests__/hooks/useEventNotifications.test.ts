/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { useEventNotifications } from '@/hooks/useEventNotifications';
import { CalendarEvent } from '@/types';

// A fixed "now" so scheduling is deterministic.
const NOW = new Date('2026-07-02T09:00:00Z').getTime();

let notificationCalls: Array<{ title: string; options?: NotificationOptions }>;

class MockNotification {
  static permission: NotificationPermission = 'granted';
  static requestPermission = jest.fn(async () => MockNotification.permission);
  constructor(public title: string, public options?: NotificationOptions) {
    notificationCalls.push({ title, options });
  }
}

function makeEvent(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 'evt-1',
    title: 'Standup',
    source: 'google',
    startTime: new Date(NOW + 30 * 60 * 1000), // 30 min from now
    endTime: new Date(NOW + 60 * 60 * 1000),
    ...overrides,
  };
}

beforeEach(() => {
  notificationCalls = [];
  MockNotification.permission = 'granted';
  MockNotification.requestPermission = jest.fn(async () => MockNotification.permission);
  // @ts-expect-error - assigning mock to global
  global.Notification = MockNotification;
  // @ts-expect-error - the hook checks `'Notification' in window`
  window.Notification = MockNotification;
  // The global jest setup stubs getItem to always return null; make it read back.
  const store: Record<string, string> = {};
  (window.localStorage.getItem as jest.Mock).mockImplementation((key: string) => store[key] ?? null);
  (window.localStorage.setItem as jest.Mock).mockImplementation((key: string, value: string) => {
    store[key] = value;
  });
  window.localStorage.setItem('eventNotificationsEnabled', 'true');
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('useEventNotifications', () => {
  it('fires 10-min-before and at-start notifications for a timed google event', () => {
    const events = [makeEvent({})];
    renderHook(() => useEventNotifications(events));

    // 20 minutes in -> 10 minutes before the 30-min-out event.
    act(() => {
      jest.advanceTimersByTime(20 * 60 * 1000);
    });
    expect(notificationCalls).toHaveLength(1);
    expect(notificationCalls[0].title).toContain('Standup');
    expect(notificationCalls[0].options?.body).toContain('10 minutes');

    // 10 more minutes -> event start.
    act(() => {
      jest.advanceTimersByTime(10 * 60 * 1000);
    });
    expect(notificationCalls).toHaveLength(2);
    expect(notificationCalls[1].options?.body).toContain('Starting now');
  });

  it('does not notify when disabled', () => {
    window.localStorage.setItem('eventNotificationsEnabled', 'false');
    renderHook(() => useEventNotifications([makeEvent({})]));
    act(() => {
      jest.advanceTimersByTime(60 * 60 * 1000);
    });
    expect(notificationCalls).toHaveLength(0);
  });

  it('ignores all-day, non-google, and past events', () => {
    const events = [
      makeEvent({ id: 'allday', allDay: true }),
      makeEvent({ id: 'asana', source: 'asana' }),
      makeEvent({ id: 'past', startTime: new Date(NOW - 60 * 60 * 1000), endTime: new Date(NOW) }),
    ];
    renderHook(() => useEventNotifications(events));
    act(() => {
      jest.advanceTimersByTime(2 * 60 * 60 * 1000);
    });
    expect(notificationCalls).toHaveLength(0);
  });

  it('does not fire twice when the events array re-renders', () => {
    const events = [makeEvent({})];
    const { rerender } = renderHook(({ e }) => useEventNotifications(e), {
      initialProps: { e: events },
    });

    act(() => {
      jest.advanceTimersByTime(20 * 60 * 1000);
    });
    expect(notificationCalls).toHaveLength(1);

    // New array reference, same event -> must not reschedule the already-fired notif.
    rerender({ e: [makeEvent({})] });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(notificationCalls).toHaveLength(1);
  });

  it('does not enable notifications when permission is denied', async () => {
    MockNotification.permission = 'denied';
    window.localStorage.setItem('eventNotificationsEnabled', 'false');
    const { result } = renderHook(() => useEventNotifications([makeEvent({})]));

    await act(async () => {
      await result.current.toggle();
    });

    expect(result.current.enabled).toBe(false);
    act(() => {
      jest.advanceTimersByTime(60 * 60 * 1000);
    });
    expect(notificationCalls).toHaveLength(0);
  });
});
