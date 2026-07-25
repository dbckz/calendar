/**
 * @jest-environment node
 *
 * The analysis endpoint: stored weekly-stats records in, summaries out, newest
 * week first. Storage is mocked; summariseWeek runs for real so the per-category
 * numbers the view renders are exercised end to end.
 */
jest.mock('@/lib/user-data-storage', () => ({
  getAllWeeklyStats: jest.fn(),
  getLastReconciledAt: jest.fn(),
  getAnalysisStartDate: jest.fn(),
}));
jest.mock('@/lib/integration-storage', () => ({ getIntegrations: jest.fn() }));
jest.mock('@/lib/time-tracking-storage', () => ({ getTimeTrackingData: jest.fn() }));

import { GET } from '@/app/api/analysis/route';
import { getAllWeeklyStats, getLastReconciledAt, getAnalysisStartDate } from '@/lib/user-data-storage';
import { getIntegrations } from '@/lib/integration-storage';
import { getTimeTrackingData } from '@/lib/time-tracking-storage';
import type { WeeklyStatsRecord, WeeklyTaskOutcome, WeeklyTaskOutcomeKind } from '@/types';

const outcome = (
  taskId: string,
  category: string,
  kind: WeeklyTaskOutcomeKind
): WeeklyTaskOutcome => ({
  taskId,
  title: `Task ${taskId}`,
  category,
  scheduledAt: '2026-07-13T09:00:00.000Z',
  outcome: kind,
  outcomeAt: '2026-07-17T17:00:00.000Z',
});

function record(
  weekStart: string,
  outcomes: WeeklyTaskOutcome[],
  integrations: WeeklyStatsRecord['integrations'] = {}
): WeeklyStatsRecord {
  return {
    weekStart,
    createdAt: `${weekStart}T08:00:00.000Z`,
    updatedAt: `${weekStart}T18:00:00.000Z`,
    tasks: Object.fromEntries(outcomes.map(o => [o.taskId, o])),
    integrations,
  };
}

async function analysis() {
  const res = await GET();
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  jest.clearAllMocks();
  (getAllWeeklyStats as jest.Mock).mockResolvedValue({});
  (getLastReconciledAt as jest.Mock).mockResolvedValue(null);
  (getAnalysisStartDate as jest.Mock).mockResolvedValue('2026-07-20');
  (getIntegrations as jest.Mock).mockResolvedValue({
    googleIntegrations: [],
    asanaIntegrations: [
      { id: 'om', name: 'OM', enabled: true },
      { id: 'dbc', name: 'DBC', enabled: true },
    ],
  });
  (getTimeTrackingData as jest.Mock).mockResolvedValue({ dailyRecords: [] });
});

describe('analysis endpoint', () => {
  it('returns an empty list when nothing has been recorded', async () => {
    const { status, body } = await analysis();
    expect(status).toBe(200);
    expect(body).toEqual({ weeks: [], lastSyncedAt: null });
  });

  it('sorts weeks newest first', async () => {
    (getAllWeeklyStats as jest.Mock).mockResolvedValue({
      '2026-07-20': record('2026-07-20', [outcome('a', 'Policy', 'done')]),
      '2026-08-03': record('2026-08-03', [outcome('c', 'Policy', 'done')]),
      '2026-07-27': record('2026-07-27', [outcome('b', 'Policy', 'done')]),
    });
    const { body } = await analysis();
    expect(body.weeks.map((w: { weekStart: string }) => w.weekStart)).toEqual([
      '2026-08-03',
      '2026-07-27',
      '2026-07-20',
    ]);
  });

  it('reports per-category numbers and the completion rate for an over-scheduled week', async () => {
    (getAllWeeklyStats as jest.Mock).mockResolvedValue({
      '2026-07-20': record(
        '2026-07-20',
        [
          outcome('p1', 'Policy', 'done'),
          outcome('p2', 'Policy', 'carried'),
          outcome('p3', 'Policy', 'scheduled'),
          outcome('d1', 'Deep work', 'done'),
          outcome('d2', 'Deep work', 'dropped'),
        ],
        {
          om: {
            integrationName: 'OM',
            days: {
              '2026-07-20': { date: '2026-07-20', minutesScheduled: 120, minutesWorked: 90 },
              '2026-07-14': { date: '2026-07-14', minutesScheduled: 60, minutesWorked: 60 },
            },
          },
          dbc: {
            integrationName: 'DBC',
            days: {
              '2026-07-15': { date: '2026-07-15', minutesScheduled: 60, minutesWorked: 30 },
            },
          },
        }
      ),
    });

    const { body } = await analysis();
    expect(body.weeks).toHaveLength(1);
    const week = body.weeks[0];

    expect(week.totalScheduled).toBe(5);
    expect(week.totalCompleted).toBe(2);
    expect(week.completionRate).toBeCloseTo(0.4);

    const byCategory = Object.fromEntries(
      week.categories.map((c: { category: string }) => [c.category, c])
    );
    expect(byCategory.Policy).toMatchObject({ scheduled: 3, completed: 1, carried: 1, dropped: 0 });
    expect(byCategory['Deep work']).toMatchObject({ scheduled: 2, completed: 1, dropped: 1 });

    expect(week.totalMinutesWorked).toBe(180);
    const byIntegration = Object.fromEntries(
      week.minutesWorkedByIntegration.map((i: { integrationName: string; minutes: number }) => [
        i.integrationName,
        i.minutes,
      ])
    );
    expect(byIntegration).toEqual({ OM: 150, DBC: 30 });
  });

  it('returns a 500 with an error when the store fails', async () => {
    (getAllWeeklyStats as jest.Mock).mockRejectedValue(new Error('disk on fire'));
    const { status, body } = await analysis();
    expect(status).toBe(500);
    expect(body.error).toBe('disk on fire');
  });
});

describe('analysis endpoint — stacked time bars and drill-down', () => {
  const WEEK = '2026-07-20';

  beforeEach(() => {
    (getAllWeeklyStats as jest.Mock).mockResolvedValue({
      [WEEK]: record(WEEK, [outcome('t1', 'Writing/Deep Work', 'done')], {
        om: {
          integrationName: 'OM',
          days: {
            '2026-07-20': {
              date: '2026-07-20',
              minutesScheduled: 180,
              minutesWorked: 180,
              byCategory: { Meetings: 120, Emails: 60 },
            },
            '2026-07-21': {
              date: '2026-07-21',
              minutesScheduled: 60,
              minutesWorked: 60,
              byCategory: { 'Writing/Deep Work': 60 },
            },
          },
        },
      }),
    });
    (getTimeTrackingData as jest.Mock).mockResolvedValue({
      dailyRecords: [
        {
          date: '2026-07-20',
          recordedAt: '',
          integrationTotals: {},
          events: [
            { eventId: 'e1', title: 'Board meeting', integrationId: 'om', integrationName: 'OM', startTime: '', endTime: '', durationMinutes: 120, source: 'google', category: 'Meetings', countedMinutes: 120 },
            { eventId: 'e2', title: 'Emails', integrationId: 'om', integrationName: 'OM', startTime: '', endTime: '', durationMinutes: 60, source: 'google', category: 'Emails', countedMinutes: 60 },
            // Wholly covered by the meeting → contributes nothing, so it is not
            // offered as a drill-down row.
            { eventId: 'e3', title: 'Swallowed block', integrationId: 'om', integrationName: 'OM', startTime: '', endTime: '', durationMinutes: 30, source: 'google', category: 'Writing/Deep Work', countedMinutes: 0 },
          ],
        },
      ],
    });
  });

  it('stacks each workspace bar by category, summing to its total', async () => {
    const { body } = await analysis();
    const om = body.weeks[0].timeByIntegration.find(
      (i: { integrationId: string }) => i.integrationId === 'om'
    );

    expect(om.totalMinutes).toBe(240);
    expect(om.segments.map((s: { category: string; minutes: number }) => [s.category, s.minutes])).toEqual([
      ['Meetings', 120],
      ['Emails', 60],
      ['Writing/Deep Work', 60],
    ]);
    // Segments sum to the bar total, and shares sum to 1.
    const sum = om.segments.reduce((n: number, s: { minutes: number }) => n + s.minutes, 0);
    expect(sum).toBe(om.totalMinutes);
    expect(om.segments.reduce((n: number, s: { share: number }) => n + s.share, 0)).toBeCloseTo(1);
  });

  it('keeps a workspace with no time as a zero bar', async () => {
    const { body } = await analysis();
    const dbc = body.weeks[0].timeByIntegration.find(
      (i: { integrationId: string }) => i.integrationId === 'dbc'
    );
    expect(dbc).toMatchObject({ integrationName: 'DBC', totalMinutes: 0, segments: [] });
  });

  it('serves drill-down rows for the contributing events only', async () => {
    const { body } = await analysis();
    const titles = body.weeks[0].events.map((e: { title: string }) => e.title);
    expect(titles).toEqual(['Board meeting', 'Emails']);
    expect(body.weeks[0].events[0]).toMatchObject({
      integrationId: 'om',
      category: 'Meetings',
      date: '2026-07-20',
      durationMinutes: 120,
    });
  });

  it('reports when the calendar was last synced', async () => {
    (getLastReconciledAt as jest.Mock).mockResolvedValue('2026-07-25T08:00:00.000Z');
    const { body } = await analysis();
    expect(body.lastSyncedAt).toBe('2026-07-25T08:00:00.000Z');
  });
});

describe('analysis endpoint — analysis start date', () => {
  it('hides weeks from before the app was in use', async () => {
    (getAllWeeklyStats as jest.Mock).mockResolvedValue({
      // The week of 13 July: recorded, but before the start date.
      '2026-07-13': record('2026-07-13', [outcome('old', 'Policy', 'done')]),
      '2026-07-20': record('2026-07-20', [outcome('new', 'Policy', 'done')]),
    });

    const { body } = await analysis();

    expect(body.weeks.map((w: { weekStart: string }) => w.weekStart)).toEqual(['2026-07-20']);
  });

  it('follows a moved start date', async () => {
    (getAnalysisStartDate as jest.Mock).mockResolvedValue('2026-07-13');
    (getAllWeeklyStats as jest.Mock).mockResolvedValue({
      '2026-07-13': record('2026-07-13', [outcome('old', 'Policy', 'done')]),
      '2026-07-20': record('2026-07-20', [outcome('new', 'Policy', 'done')]),
    });

    const { body } = await analysis();

    expect(body.weeks).toHaveLength(2);
  });
});
