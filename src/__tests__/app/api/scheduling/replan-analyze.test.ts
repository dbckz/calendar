/**
 * @jest-environment node
 *
 * Tests for the replan analyze route's daily-review block assembly — the parts
 * that feed the DailyReviewModal:
 *   * stored-title fallback for an Asana task already complete (and thus absent
 *     from the live incomplete fetch),
 *   * the `completedInAsana` flag distinguishing Asana-complete from a planning
 *     override,
 *   * the actual event interval (`startMs`) preferring the matched calendar
 *     event over the stored slot (so a dragged event shows its real time).
 * gatherWeekContext + the storage getters are mocked so the route runs pure.
 */
import type { WorkflowConfig } from '@/lib/workflow-config-storage';

jest.mock('@/lib/scheduling/gather', () => ({
  ...jest.requireActual('@/lib/scheduling/gather'),
  gatherWeekContext: jest.fn(),
}));

jest.mock('@/lib/user-data-storage', () => ({
  getScheduledAsanaTasks: jest.fn(),
  getAdHocTasks: jest.fn(),
  getCustomTaskTypes: jest.fn(),
  getPrepBlocks: jest.fn(),
  getRitualBlocks: jest.fn(),
  getBlockDoneOverrides: jest.fn(),
  getDailyReviewState: jest.fn(),
}));

import { POST } from '@/app/api/scheduling/replan/analyze/route';
import { gatherWeekContext } from '@/lib/scheduling/gather';
import {
  getScheduledAsanaTasks,
  getAdHocTasks,
  getCustomTaskTypes,
  getPrepBlocks,
  getRitualBlocks,
  getBlockDoneOverrides,
  getDailyReviewState,
} from '@/lib/user-data-storage';
import type { ReplanReviewBlock } from '@/lib/scheduling/replan';

const mockGather = gatherWeekContext as jest.MockedFunction<typeof gatherWeekContext>;
const mockScheduled = getScheduledAsanaTasks as jest.Mock;
const mockAdHoc = getAdHocTasks as jest.Mock;
const mockCustomTypes = getCustomTaskTypes as jest.Mock;
const mockPrep = getPrepBlocks as jest.Mock;
const mockRitual = getRitualBlocks as jest.Mock;
const mockOverrides = getBlockDoneOverrides as jest.Mock;
const mockReviewState = getDailyReviewState as jest.Mock;

const WEEK_START = new Date(2026, 6, 13, 0, 0, 0, 0); // Monday 2026-07-13
const NOW = new Date(2026, 6, 15, 8, 0, 0, 0); // Wednesday 08:00 (after Monday blocks)

const CONFIG: WorkflowConfig = {
  taskQuotas: {},
  typeMapping: {},
  scheduling: {
    bufferBetweenTasks: '0min',
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    workingHours: { start: '09:00', end: '17:00' },
  },
  lastUpdated: '2026-07-12T00:00:00.000Z',
};

function setContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  over: { weekEvents?: any[]; asanaCandidates?: any[]; asanaNameByGid?: Map<string, string> } = {}
) {
  mockGather.mockResolvedValue({
    now: NOW,
    weekStart: WEEK_START,
    weekStartStr: '2026-07-13',
    weekEndStr: '2026-07-19',
    weekEvents: over.weekEvents ?? [],
    asanaCandidates: over.asanaCandidates ?? [],
    asanaNameByGid: over.asanaNameByGid ?? new Map(),
    quotas: [],
    config: CONFIG,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function analyze(): Promise<{ reviewBlocks: ReplanReviewBlock[]; tomorrowBlocks: any[] }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await POST({ json: async () => ({}) } as any);
  return res.json();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAdHoc.mockResolvedValue([]);
  mockCustomTypes.mockResolvedValue([]);
  mockPrep.mockResolvedValue([]);
  mockRitual.mockResolvedValue([]);
  mockOverrides.mockResolvedValue({});
  // A last-review well before the week's blocks, so the "since last review"
  // window includes them (these tests exercise title/interval logic, not the
  // window itself — see the dedicated window test below).
  mockReviewState.mockResolvedValue({ lastReviewedAt: '2026-07-01T00:00:00.000Z', dismissedTitles: [] });
});

describe('replan analyze — daily review blocks', () => {
  it('falls back to the stored task name when the Asana task is already complete', async () => {
    mockScheduled.mockResolvedValue([
      {
        id: 's1',
        asanaTaskId: 'g-done',
        scheduledDate: '2026-07-13',
        scheduledTime: '09:00',
        duration: 60,
        googleEventId: 'evt-done',
        googleIntegrationId: 'gi1',
        taskName: 'Write the report',
      },
    ]);
    setContext({ asanaCandidates: [] }); // g-done absent → complete in Asana

    const { reviewBlocks } = await analyze();
    const block = reviewBlocks.find(b => b.googleEventId === 'evt-done');

    expect(block).toBeDefined();
    expect(block!.titles).toEqual(['Write the report']);
    expect(block!.tasks[0].title).toBe('Write the report');
    expect(block!.done).toBe(true);
    expect(block!.tasks[0].completedInAsana).toBe(true);
  });

  it('prefers the live Asana name and omits completedInAsana for an incomplete task', async () => {
    mockScheduled.mockResolvedValue([
      {
        id: 's1',
        asanaTaskId: 'g-open',
        scheduledDate: '2026-07-13',
        scheduledTime: '09:00',
        duration: 60,
        googleEventId: 'evt-open',
        googleIntegrationId: 'gi1',
        taskName: 'Stale stored name',
      },
    ]);
    setContext({
      asanaCandidates: [{ task: { gid: 'g-open', name: 'Live name' }, typeValue: 'deep' }],
    });

    const { reviewBlocks } = await analyze();
    const block = reviewBlocks.find(b => b.googleEventId === 'evt-open');

    expect(block!.titles).toEqual(['Live name']);
    expect(block!.done).toBe(false);
    expect(block!.tasks[0].completedInAsana).toBeUndefined();
  });

  it('recovers a legacy single-task title from the calendar event title', async () => {
    mockScheduled.mockResolvedValue([
      {
        id: 's1',
        asanaTaskId: 'g-done',
        scheduledDate: '2026-07-13',
        scheduledTime: '09:00',
        duration: 60,
        googleEventId: 'evt-legacy',
        googleIntegrationId: 'gi1',
        // no taskName: entry predates title capture
      },
    ]);
    setContext({
      weekEvents: [
        {
          id: 'evt-legacy',
          allDay: false,
          title: '✍️ Write the report',
          startTime: new Date(2026, 6, 13, 9, 0).toISOString(),
          endTime: new Date(2026, 6, 13, 10, 0).toISOString(),
        },
      ],
    });

    const { reviewBlocks } = await analyze();
    const block = reviewBlocks.find(b => b.googleEventId === 'evt-legacy');

    expect(block!.titles).toEqual(['Write the report']);
  });

  it('recovers legacy grouped-task titles from the event description agenda', async () => {
    const shared = {
      scheduledDate: '2026-07-13',
      scheduledTime: '09:00',
      duration: 60,
      googleEventId: 'evt-group',
      googleIntegrationId: 'gi1',
    };
    mockScheduled.mockResolvedValue([
      { id: 's1', asanaTaskId: '111', ...shared },
      { id: 's2', asanaTaskId: '222', ...shared },
    ]);
    setContext({
      weekEvents: [
        {
          id: 'evt-group',
          allDay: false,
          title: '🤝 Engagement / Outreach',
          description:
            'Grouped block\n\n• First task\n  https://app.asana.com/0/0/111/f\n• Second task\n  https://app.asana.com/0/0/222/f',
          startTime: new Date(2026, 6, 13, 9, 0).toISOString(),
          endTime: new Date(2026, 6, 13, 10, 0).toISOString(),
        },
      ],
    });

    const { reviewBlocks } = await analyze();
    const block = reviewBlocks.find(b => b.googleEventId === 'evt-group');

    expect(block!.titles).toEqual(['First task', 'Second task']);
  });

  it('resolves a completed grouped member from the completed-inclusive name map', async () => {
    // A Batch block with two members: one still open (in the live incomplete
    // fetch) and one completed this week (absent from candidates, present in
    // asanaNameByGid). The completed member must show its real name, not the
    // "Scheduled task" placeholder — no stored taskName, no event agenda.
    const shared = {
      scheduledDate: '2026-07-13',
      scheduledTime: '09:00',
      duration: 60,
      googleEventId: 'evt-batch',
      googleIntegrationId: 'gi1',
    };
    mockScheduled.mockResolvedValue([
      { id: 's1', asanaTaskId: 'g-open', ...shared },
      { id: 's2', asanaTaskId: 'g-done', ...shared },
    ]);
    setContext({
      asanaCandidates: [{ task: { gid: 'g-open', name: 'Check MLex' }, typeValue: 'batch' }],
      asanaNameByGid: new Map([
        ['g-open', 'Check MLex'],
        ['g-done', 'File the expenses'],
      ]),
    });

    const { reviewBlocks } = await analyze();
    const block = reviewBlocks.find(b => b.googleEventId === 'evt-batch');

    expect(block!.titles).toEqual(['Check MLex', 'File the expenses']);
    // The open member stays open; the completed one reads as complete in Asana.
    expect(block!.tasks[0].completedInAsana).toBeUndefined();
    expect(block!.tasks[1].completedInAsana).toBe(true);
  });

  it('uses the matched calendar event interval for startMs (dragged event)', async () => {
    // Stored slot says 09:00; the live event was dragged to 14:00.
    const draggedStart = new Date(2026, 6, 13, 14, 0, 0, 0);
    const draggedEnd = new Date(2026, 6, 13, 15, 0, 0, 0);
    mockScheduled.mockResolvedValue([
      {
        id: 's1',
        asanaTaskId: 'g-done',
        scheduledDate: '2026-07-13',
        scheduledTime: '09:00',
        duration: 60,
        googleEventId: 'evt-done',
        googleIntegrationId: 'gi1',
        taskName: 'Write the report',
      },
    ]);
    setContext({
      weekEvents: [
        {
          id: 'evt-done',
          allDay: false,
          startTime: draggedStart.toISOString(),
          endTime: draggedEnd.toISOString(),
        },
      ],
    });

    const { reviewBlocks } = await analyze();
    const block = reviewBlocks.find(b => b.googleEventId === 'evt-done');

    // Stored slot fields stay intact for the apply payload…
    expect(block!.date).toBe('2026-07-13');
    expect(block!.start).toBe('09:00');
    // …but the displayed interval is the actual (dragged) event time.
    expect(block!.startMs).toBe(draggedStart.getTime());
  });

  it('excludes blocks that ended before the last review (since-last-review window)', async () => {
    // A Monday 09:00–10:00 block; last review was Monday 12:00 → already covered.
    mockScheduled.mockResolvedValue([
      {
        id: 's1',
        asanaTaskId: 'g-done',
        scheduledDate: '2026-07-13',
        scheduledTime: '09:00',
        duration: 60,
        googleEventId: 'evt-old',
        googleIntegrationId: 'gi1',
        taskName: 'Already reviewed',
      },
    ]);
    mockReviewState.mockResolvedValue({
      lastReviewedAt: new Date(2026, 6, 13, 12, 0, 0).toISOString(),
      dismissedTitles: [],
    });
    setContext({ asanaCandidates: [] });

    const { reviewBlocks } = await analyze();
    expect(reviewBlocks.find(b => b.googleEventId === 'evt-old')).toBeUndefined();
  });

  it('offers tomorrow\'s displaceable task blocks as prioritise-tomorrow victims', async () => {
    // NOW is Wed 2026-07-15 08:00 → tomorrow is Thu 2026-07-16. A future Thursday
    // task block is a valid victim; a Wednesday (today) block is not.
    mockScheduled.mockResolvedValue([
      {
        id: 's-thu',
        asanaTaskId: 'g-thu',
        scheduledDate: '2026-07-16',
        scheduledTime: '09:00',
        duration: 60,
        googleEventId: 'evt-thu',
        googleIntegrationId: 'gi1',
        taskName: 'Thursday task',
      },
      {
        id: 's-wed',
        asanaTaskId: 'g-wed',
        scheduledDate: '2026-07-15',
        scheduledTime: '09:00',
        duration: 60,
        googleEventId: 'evt-wed',
        googleIntegrationId: 'gi1',
        taskName: 'Wednesday task',
      },
    ]);
    setContext({
      asanaCandidates: [
        { task: { gid: 'g-thu', name: 'Thursday task' }, typeValue: 'deep' },
        { task: { gid: 'g-wed', name: 'Wednesday task' }, typeValue: 'deep' },
      ],
      asanaNameByGid: new Map([
        ['g-thu', 'Thursday task'],
        ['g-wed', 'Wednesday task'],
      ]),
    });

    const { tomorrowBlocks } = await analyze();
    expect(tomorrowBlocks.map(b => b.googleEventId)).toEqual(['evt-thu']);
    expect(tomorrowBlocks[0]).toMatchObject({
      date: '2026-07-16',
      start: '09:00',
      durationMinutes: 60,
      taskIds: ['g-thu'],
    });
  });

  it('excludes rituals from tomorrow\'s displaceable blocks', async () => {
    mockScheduled.mockResolvedValue([]);
    // A Thursday ritual must never be offered as a bump victim.
    mockRitual.mockResolvedValue([
      {
        id: 'r1',
        title: '🏋️ Exercise',
        date: '2026-07-16',
        start: '15:00',
        durationMinutes: 60,
        googleEventId: 'evt-ritual',
        googleIntegrationId: 'gi1',
      },
    ]);
    setContext({});

    const { tomorrowBlocks } = await analyze();
    expect(tomorrowBlocks).toHaveLength(0);
  });

  it('drops a bare calendar event whose title was dismissed as "not a task"', async () => {
    // A solo, ended, unowned calendar event that the user dismissed by title.
    mockReviewState.mockResolvedValue({
      lastReviewedAt: '2026-07-01T00:00:00.000Z',
      dismissedTitles: ['300k review'],
    });
    setContext({
      weekEvents: [
        {
          id: 'cal-1',
          title: '300k review',
          allDay: false,
          startTime: new Date(2026, 6, 13, 9, 0, 0).toISOString(),
          endTime: new Date(2026, 6, 13, 10, 0, 0).toISOString(),
          integrationId: 'gi1',
        },
      ],
    });

    const { reviewBlocks } = await analyze();
    expect(reviewBlocks.find(b => b.googleEventId === 'cal-1')).toBeUndefined();
  });
});
