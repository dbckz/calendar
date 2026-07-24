/**
 * @jest-environment node
 *
 * The analysis endpoint: stored weekly-stats records in, summaries out, newest
 * week first. Storage is mocked; summariseWeek runs for real so the per-category
 * numbers the view renders are exercised end to end.
 */
jest.mock('@/lib/user-data-storage', () => ({ getAllWeeklyStats: jest.fn() }));

import { GET } from '@/app/api/analysis/route';
import { getAllWeeklyStats } from '@/lib/user-data-storage';
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
});

describe('analysis endpoint', () => {
  it('returns an empty list when nothing has been recorded', async () => {
    const { status, body } = await analysis();
    expect(status).toBe(200);
    expect(body).toEqual({ weeks: [] });
  });

  it('sorts weeks newest first', async () => {
    (getAllWeeklyStats as jest.Mock).mockResolvedValue({
      '2026-07-06': record('2026-07-06', [outcome('a', 'Policy', 'done')]),
      '2026-07-20': record('2026-07-20', [outcome('c', 'Policy', 'done')]),
      '2026-07-13': record('2026-07-13', [outcome('b', 'Policy', 'done')]),
    });
    const { body } = await analysis();
    expect(body.weeks.map((w: { weekStart: string }) => w.weekStart)).toEqual([
      '2026-07-20',
      '2026-07-13',
      '2026-07-06',
    ]);
  });

  it('reports per-category numbers and the completion rate for an over-scheduled week', async () => {
    (getAllWeeklyStats as jest.Mock).mockResolvedValue({
      '2026-07-13': record(
        '2026-07-13',
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
              '2026-07-13': { date: '2026-07-13', minutesScheduled: 120, minutesWorked: 90 },
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
