/**
 * @jest-environment node
 *
 * The week-state endpoint: how the stored plan artefacts and the daily-review
 * stamp turn into the dashboard's adaptive button state. All storage is mocked
 * so the route runs pure and no Google/Asana call is made.
 */
jest.mock('@/lib/workflow-config-storage', () => ({ getWorkflowConfig: jest.fn() }));
jest.mock('@/lib/user-data-storage', () => ({
  getScheduledAsanaTasks: jest.fn(),
  getAdHocTasks: jest.fn(),
  getPrepBlocks: jest.fn(),
  getRitualBlocks: jest.fn(),
  getDailyReviewState: jest.fn(),
}));

import { GET } from '@/app/api/scheduling/week-state/route';
import { getWorkflowConfig } from '@/lib/workflow-config-storage';
import {
  getScheduledAsanaTasks,
  getAdHocTasks,
  getPrepBlocks,
  getRitualBlocks,
  getDailyReviewState,
} from '@/lib/user-data-storage';

const CONFIG = {
  taskQuotas: {},
  typeMapping: {},
  scheduling: {
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    workingHours: { start: '09:00', end: '17:00' },
    dayRolloverHour: 4,
  },
};

async function weekState() {
  const res = await GET();
  return res.json();
}

// A scheduled Asana block on the given date.
const block = (date: string, start = '09:00') => ({
  id: `s-${date}-${start}`,
  asanaTaskId: `g-${date}`,
  scheduledDate: date,
  scheduledTime: start,
  duration: 60,
  googleEventId: `evt-${date}-${start}`,
});

beforeEach(() => {
  jest.clearAllMocks();
  (getWorkflowConfig as jest.Mock).mockResolvedValue(CONFIG);
  (getScheduledAsanaTasks as jest.Mock).mockResolvedValue([]);
  (getAdHocTasks as jest.Mock).mockResolvedValue([]);
  (getPrepBlocks as jest.Mock).mockResolvedValue([]);
  (getRitualBlocks as jest.Mock).mockResolvedValue([]);
  (getDailyReviewState as jest.Mock).mockResolvedValue({ lastReviewedAt: '', dismissedTitles: [] });
});

afterEach(() => jest.useRealTimers());

describe('week-state endpoint', () => {
  it('state 1: mid-week with nothing planned', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 15, 10, 0)); // Wed
    const out = await weekState();
    expect(out).toMatchObject({
      action: 'plan-this-week',
      weekStart: '2026-07-13',
      nextWeekStart: '2026-07-20',
      currentWeekPlanned: false,
      endOfWeek: false,
    });
  });

  it('state 2: mid-week with this week planned', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 15, 10, 0)); // Wed
    (getScheduledAsanaTasks as jest.Mock).mockResolvedValue([block('2026-07-14')]);
    const out = await weekState();
    expect(out.action).toBe('replan');
    expect(out.currentWeekPlanned).toBe(true);
    expect(out.hasReviewableBlocks).toBe(true); // Tuesday's block has ended
  });

  it('counts ritual blocks alone as "planned"', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 15, 10, 0));
    (getRitualBlocks as jest.Mock).mockResolvedValue([
      { id: 'r1', googleEventId: 'e', title: '🍽️ Lunch', date: '2026-07-16', start: '12:30', durationMinutes: 30 },
    ]);
    const out = await weekState();
    expect(out).toMatchObject({ action: 'replan', currentWeekPlanned: true });
  });

  it('state 3: Friday evening with the review outstanding', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 17, 18, 0)); // Fri
    (getScheduledAsanaTasks as jest.Mock).mockResolvedValue([block('2026-07-15')]);
    const out = await weekState();
    expect(out).toMatchObject({
      action: 'wrap-up',
      endOfWeek: true,
      endOfWeekReviewDone: false,
      hasReviewableBlocks: true,
    });
  });

  it('state 4: Friday evening once the review is done', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 17, 18, 0));
    (getScheduledAsanaTasks as jest.Mock).mockResolvedValue([block('2026-07-15')]);
    (getDailyReviewState as jest.Mock).mockResolvedValue({
      lastReviewedAt: new Date(2026, 6, 17, 17, 30).toISOString(),
      dismissedTitles: [],
    });
    const out = await weekState();
    expect(out).toMatchObject({ action: 'plan-next-week', endOfWeekReviewDone: true });
  });

  it('a mid-week review does not satisfy the end-of-week gate', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 17, 18, 0));
    (getScheduledAsanaTasks as jest.Mock).mockResolvedValue([block('2026-07-15')]);
    (getDailyReviewState as jest.Mock).mockResolvedValue({
      lastReviewedAt: new Date(2026, 6, 15, 18, 0).toISOString(),
      dismissedTitles: [],
    });
    expect((await weekState()).action).toBe('wrap-up');
  });

  it('state 5: next week already has blocks', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 18, 11, 0)); // Sat
    (getScheduledAsanaTasks as jest.Mock).mockResolvedValue([
      block('2026-07-15'),
      block('2026-07-21'),
    ]);
    const out = await weekState();
    expect(out).toMatchObject({ action: 'replan-next-week', nextWeekPlanned: true });
  });

  it('edge: end of week with a week that was never planned skips the wrap-up gate', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 17, 18, 0));
    const out = await weekState();
    expect(out).toMatchObject({
      action: 'plan-next-week',
      currentWeekPlanned: false,
      hasReviewableBlocks: false,
    });
  });

  it('honours the day-rollover hour: Friday 01:00 is still Thursday', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 17, 1, 0));
    (getScheduledAsanaTasks as jest.Mock).mockResolvedValue([block('2026-07-15')]);
    const out = await weekState();
    expect(out.endOfWeek).toBe(false);
    expect(out.action).toBe('replan');
  });
});
