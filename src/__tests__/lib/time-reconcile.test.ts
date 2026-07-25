/**
 * @jest-environment node
 *
 * The server-side reconcile: past days are rebuilt from the live calendar so
 * retro-edits (a deleted meeting, a dragged block) reach the stored record —
 * while today stays the client's job and a failed fetch never wipes history.
 */
jest.mock('@/lib/integration-storage', () => ({
  getEnabledGoogleIntegrations: jest.fn(),
  getEnabledAsanaIntegrations: jest.fn(),
}));
jest.mock('@/lib/scheduling/gather', () => ({ fetchEventsForDays: jest.fn() }));
jest.mock('@/lib/time-tracking-storage', () => ({
  getTimeTrackingData: jest.fn(),
  recordDailyTime: jest.fn(),
}));
jest.mock('@/lib/user-data-storage', () => ({
  getAdHocTasks: jest.fn(),
  getScheduledAsanaTasks: jest.fn(),
  getGoogleEventAttributions: jest.fn(),
  recordWeeklyTime: jest.fn(),
  getEventAttributionRules: jest.fn(),
  getAnalysisStartDate: jest.fn(),
  pruneWeeklyStatsBefore: jest.fn(),
}));
jest.mock('@/lib/workflow-config-storage', () => ({ getWorkflowConfig: jest.fn() }));

import { reconcilePastDays } from '@/lib/time-reconcile';
import { getEnabledGoogleIntegrations, getEnabledAsanaIntegrations } from '@/lib/integration-storage';
import { fetchEventsForDays } from '@/lib/scheduling/gather';
import { getTimeTrackingData, recordDailyTime } from '@/lib/time-tracking-storage';
import {
  getAdHocTasks,
  getScheduledAsanaTasks,
  getGoogleEventAttributions,
  recordWeeklyTime,
  getEventAttributionRules,
  getAnalysisStartDate,
  pruneWeeklyStatsBefore,
} from '@/lib/user-data-storage';
import { getWorkflowConfig } from '@/lib/workflow-config-storage';
import type { CalendarEvent } from '@/types';

const OM_GOOGLE = 'google-om';
const OM_ASANA = 'asana-om';

// Today is Saturday 2026-07-25, so yesterday is Friday 2026-07-24.
const TODAY = new Date(2026, 6, 25, 10, 0, 0);
const YESTERDAY = '2026-07-24';

const event = (over: Partial<CalendarEvent> & { id: string }): CalendarEvent => ({
  title: 'OM meeting',
  startTime: new Date(2026, 6, 24, 9, 0),
  endTime: new Date(2026, 6, 24, 10, 0),
  source: 'google',
  allDay: false,
  integrationId: OM_GOOGLE,
  attendeeCount: 3,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(TODAY);
  (getWorkflowConfig as jest.Mock).mockResolvedValue({
    taskQuotas: {},
    typeMapping: {},
    scheduling: { dayRolloverHour: 4 },
  });
  (getEnabledGoogleIntegrations as jest.Mock).mockResolvedValue([{ id: OM_GOOGLE, name: 'OM' }]);
  (getEnabledAsanaIntegrations as jest.Mock).mockResolvedValue([
    { id: OM_ASANA, name: 'OM', eventGoogleIntegrationId: OM_GOOGLE },
  ]);
  (getScheduledAsanaTasks as jest.Mock).mockResolvedValue([]);
  (getAdHocTasks as jest.Mock).mockResolvedValue([]);
  (getGoogleEventAttributions as jest.Mock).mockResolvedValue([]);
  (getEventAttributionRules as jest.Mock).mockResolvedValue([]);
  // Well before the test dates, so the start-date floor is not what limits them.
  (getAnalysisStartDate as jest.Mock).mockResolvedValue('2026-01-01');
  (pruneWeeklyStatsBefore as jest.Mock).mockResolvedValue([]);
  // Tracking began the day before yesterday, so only those days are candidates.
  (getTimeTrackingData as jest.Mock).mockResolvedValue({
    dailyRecords: [{ date: '2026-07-23', recordedAt: '', integrationTotals: {}, events: [] }],
  });
  (fetchEventsForDays as jest.Mock).mockResolvedValue({
    events: [],
    fetchedIntegrationIds: new Set([OM_GOOGLE]),
  });
});

afterEach(() => jest.useRealTimers());

describe('reconcilePastDays', () => {
  it('rewrites a past day from the calendar, with worked === scheduled', async () => {
    (fetchEventsForDays as jest.Mock).mockImplementation(async (_ints, days: Date[]) =>
      days[0].getDate() === 24
        ? { events: [event({ id: 'e1' })], fetchedIntegrationIds: new Set([OM_GOOGLE]) }
        : { events: [], fetchedIntegrationIds: new Set([OM_GOOGLE]) }
    );

    const result = await reconcilePastDays(2);

    expect(result.updated).toBe(2);
    const friday = (recordDailyTime as jest.Mock).mock.calls.find(c => c[0] === YESTERDAY)!;
    expect(friday[1]).toEqual({
      [OM_ASANA]: { integrationId: OM_ASANA, integrationName: 'OM', totalMinutes: 60 },
    });
    expect(friday[2]).toEqual([
      expect.objectContaining({
        eventId: 'e1',
        category: 'Meetings',
        durationMinutes: 60,
        countedMinutes: 60,
      }),
    ]);
    // A fully-elapsed day: the weekly record gets equal worked and scheduled.
    const weekly = (recordWeeklyTime as jest.Mock).mock.calls.find(c => c[1] === YESTERDAY)!;
    expect(weekly[2]).toEqual([
      expect.objectContaining({
        integrationId: OM_ASANA,
        minutesScheduled: 60,
        minutesWorked: 60,
        byCategory: { Meetings: 60 },
      }),
    ]);
  });

  it('drops an event Dave deleted from the calendar', async () => {
    // The calendar now returns nothing for that day: the rewritten record is empty.
    await reconcilePastDays(1);

    const friday = (recordDailyTime as jest.Mock).mock.calls.find(c => c[0] === YESTERDAY)!;
    expect(friday[1]).toEqual({});
    expect(friday[2]).toEqual([]);
  });

  it('never touches today — the client owns the live day', async () => {
    await reconcilePastDays(14);
    const dates = (recordDailyTime as jest.Mock).mock.calls.map(c => c[0]);
    expect(dates).not.toContain('2026-07-25');
    expect(dates.every((d: string) => d < '2026-07-25')).toBe(true);
  });

  it('leaves a day alone when no integration fetched cleanly', async () => {
    (fetchEventsForDays as jest.Mock).mockResolvedValue({
      events: [],
      fetchedIntegrationIds: new Set(),
    });

    const result = await reconcilePastDays(2);

    expect(recordDailyTime).not.toHaveBeenCalled();
    expect(recordWeeklyTime).not.toHaveBeenCalled();
    expect(result.updated).toBe(0);
    expect(result.skipped).toEqual(['2026-07-24', '2026-07-23']);
  });

  it('ignores events from an integration whose fetch failed', async () => {
    // 'other-google' is absent from fetchedIntegrationIds → its events are not
    // trusted, so they cannot add phantom time.
    (fetchEventsForDays as jest.Mock).mockResolvedValue({
      events: [event({ id: 'trusted' }), event({ id: 'untrusted', integrationId: 'other-google' })],
      fetchedIntegrationIds: new Set([OM_GOOGLE]),
    });

    await reconcilePastDays(1);

    const friday = (recordDailyTime as jest.Mock).mock.calls.find(c => c[0] === YESTERDAY)!;
    expect(friday[2].map((e: { eventId: string }) => e.eventId)).toEqual(['trusted']);
  });

  it('does not reach back before tracking began', async () => {
    await reconcilePastDays(30);
    const dates = (recordDailyTime as jest.Mock).mock.calls.map(c => c[0]).sort();
    expect(dates).toEqual(['2026-07-23', '2026-07-24']);
  });

  it('re-links a scheduled task so attribution matches the client exactly', async () => {
    (getScheduledAsanaTasks as jest.Mock).mockResolvedValue([
      { id: 's1', asanaTaskId: 'g1', integrationId: 'asana-dbc', googleEventId: 'e1' },
    ]);
    (fetchEventsForDays as jest.Mock).mockResolvedValue({
      events: [event({ id: 'e1', attendeeCount: undefined, title: '✍️ Draft' })],
      fetchedIntegrationIds: new Set([OM_GOOGLE]),
    });

    await reconcilePastDays(1);

    // The task link (DBC) beats the calendar it sits on (OM), just as it does live.
    const friday = (recordDailyTime as jest.Mock).mock.calls.find(c => c[0] === YESTERDAY)!;
    expect(Object.keys(friday[1])).toEqual(['asana-dbc']);
  });
});

describe('reconcile floors and attribution rules', () => {
  it('never reaches back before the analysis start date', async () => {
    (getAnalysisStartDate as jest.Mock).mockResolvedValue('2026-07-24');
    (getTimeTrackingData as jest.Mock).mockResolvedValue({
      dailyRecords: [{ date: '2026-07-01', recordedAt: '', integrationTotals: {}, events: [] }],
    });

    const result = await reconcilePastDays(14);

    expect(result.days).toBe(1);
    expect((recordDailyTime as jest.Mock).mock.calls.map(c => c[0])).toEqual(['2026-07-24']);
  });

  it('prunes weekly-stats records from before the analysis start date', async () => {
    (getAnalysisStartDate as jest.Mock).mockResolvedValue('2026-07-20');
    await reconcilePastDays(1);
    expect(pruneWeeklyStatsBefore).toHaveBeenCalledWith('2026-07-20');
  });

  it('applies a series/title attribution rule exactly as the live path does', async () => {
    // "Weekly professional planning" is on no workspace-mapped calendar, so only
    // the built-in rule can attribute it — to DBC.
    (fetchEventsForDays as jest.Mock).mockResolvedValue({
      events: [
        event({
          id: 'planning',
          title: 'Weekly professional planning',
          integrationId: 'google-life',
          attendeeCount: undefined,
        }),
      ],
      fetchedIntegrationIds: new Set(['google-life']),
    });
    (getEnabledGoogleIntegrations as jest.Mock).mockResolvedValue([{ id: 'google-life', name: 'Personal' }]);

    await reconcilePastDays(1);

    const friday = (recordDailyTime as jest.Mock).mock.calls.find(c => c[0] === YESTERDAY)!;
    expect(Object.keys(friday[1])).toEqual(['29e78568-0681-4acc-b6b0-a7ffa9d31230']);
  });

  it('leaves "Weekly personal planning" attributed to nothing', async () => {
    (fetchEventsForDays as jest.Mock).mockResolvedValue({
      events: [
        event({
          id: 'personal-planning',
          title: 'Weekly personal planning',
          integrationId: 'google-life',
          attendeeCount: undefined,
        }),
      ],
      fetchedIntegrationIds: new Set(['google-life']),
    });
    (getEnabledGoogleIntegrations as jest.Mock).mockResolvedValue([{ id: 'google-life', name: 'Personal' }]);

    await reconcilePastDays(1);

    const friday = (recordDailyTime as jest.Mock).mock.calls.find(c => c[0] === YESTERDAY)!;
    expect(friday[1]).toEqual({});
  });
});
