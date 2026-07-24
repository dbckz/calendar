/**
 * @jest-environment node
 *
 * Tests for the replan analyze route's end-of-week mode: on the last working day
 * (and the weekend after it) unfinished task-backed blocks come back as
 * `carryBlocks` with their member tasks, rituals never appear, and a mid-week
 * analyze is left exactly as it was.
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
  getMeetingPrepDecisions: jest.fn(),
  setMeetingPrepDecision: jest.fn(),
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
import type { ReplanCarryBlock } from '@/lib/scheduling/replan';

const mockGather = gatherWeekContext as jest.MockedFunction<typeof gatherWeekContext>;

const WEEK_START = new Date(2026, 6, 13, 0, 0, 0, 0); // Monday 2026-07-13
const FRIDAY_EVENING = new Date(2026, 6, 17, 18, 30, 0, 0); // after working hours
const WEDNESDAY = new Date(2026, 6, 15, 8, 0, 0, 0);

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

// A grouped Asana block on Monday with two members, one already complete.
const GROUPED = [
  {
    id: 's1',
    asanaTaskId: 'g-open',
    integrationId: 'ai1',
    scheduledDate: '2026-07-13',
    scheduledTime: '09:00',
    duration: 60,
    googleEventId: 'evt-group',
    googleIntegrationId: 'gi1',
    taskName: 'Draft the brief',
  },
  {
    id: 's2',
    asanaTaskId: 'g-done',
    integrationId: 'ai1',
    scheduledDate: '2026-07-13',
    scheduledTime: '09:00',
    duration: 60,
    googleEventId: 'evt-group',
    googleIntegrationId: 'gi1',
    taskName: 'Send the invites',
  },
];

// A second Writing block later the same week over an OVERLAPPING agenda: the
// planner places one grouped block per quota slot, all sharing the same tasks.
const SIBLING = [
  {
    id: 's3',
    asanaTaskId: 'g-open',
    integrationId: 'ai1',
    scheduledDate: '2026-07-16',
    scheduledTime: '12:00',
    duration: 60,
    googleEventId: 'evt-group-2',
    googleIntegrationId: 'gi1',
    taskName: 'Draft the brief',
  },
  {
    id: 's4',
    asanaTaskId: 'g-extra',
    integrationId: 'ai1',
    scheduledDate: '2026-07-16',
    scheduledTime: '12:00',
    duration: 60,
    googleEventId: 'evt-group-2',
    googleIntegrationId: 'gi1',
    taskName: 'Outline the deck',
  },
];

function setContext(now: Date, extraCandidates: Array<{ gid: string; name: string }> = []) {
  mockGather.mockResolvedValue({
    now,
    weekStart: WEEK_START,
    weekStartStr: '2026-07-13',
    weekEndStr: '2026-07-19',
    weekEvents: [],
    nextWeekEarlyEvents: [],
    // Only g-open is still incomplete in Asana.
    asanaCandidates: [
      { task: { gid: 'g-open', name: 'Draft the brief' }, integrationId: 'ai1', typeValue: null },
      ...extraCandidates.map(t => ({ task: t, integrationId: 'ai1', typeValue: null })),
    ],
    asanaNameByGid: new Map([['g-done', 'Send the invites']]),
    quotas: [],
    config: CONFIG,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

async function analyze() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await POST({ json: async () => ({}) } as any);
  return res.json() as Promise<{
    endOfWeek: boolean;
    carryBlocks?: ReplanCarryBlock[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    moves: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unplaceable: any[];
  }>;
}

beforeEach(() => {
  jest.clearAllMocks();
  (getScheduledAsanaTasks as jest.Mock).mockResolvedValue(GROUPED);
  (getAdHocTasks as jest.Mock).mockResolvedValue([]);
  (getCustomTaskTypes as jest.Mock).mockResolvedValue([]);
  (getPrepBlocks as jest.Mock).mockResolvedValue([]);
  (getRitualBlocks as jest.Mock).mockResolvedValue([]);
  (getBlockDoneOverrides as jest.Mock).mockResolvedValue({});
  (getDailyReviewState as jest.Mock).mockResolvedValue({
    lastReviewedAt: '2026-07-01T00:00:00.000Z',
    dismissedTitles: [],
  });
});

describe('replan analyze — end-of-week mode', () => {
  it('flags end of week on Friday evening and returns the block per member task', async () => {
    setContext(FRIDAY_EVENING);
    const out = await analyze();

    expect(out.endOfWeek).toBe(true);
    expect(out.carryBlocks).toHaveLength(1);
    const block = out.carryBlocks![0];
    expect(block.googleEventId).toBe('evt-group');
    expect(block.reason).toBe('unplaceable');
    expect(block.tasks).toEqual([
      expect.objectContaining({ id: 'g-open', title: 'Draft the brief', done: false, integrationId: 'ai1' }),
      expect.objectContaining({ id: 'g-done', title: 'Send the invites', done: true }),
    ]);
  });

  it('never offers a ritual block for carry-over', async () => {
    (getRitualBlocks as jest.Mock).mockResolvedValue([
      {
        id: 'r1',
        googleEventId: 'evt-lunch',
        googleIntegrationId: 'gi1',
        title: '🍽️ Lunch',
        date: '2026-07-17',
        start: '12:30',
        durationMinutes: 30,
        createdAt: '2026-07-13T00:00:00.000Z',
      },
    ]);
    setContext(FRIDAY_EVENING);
    const out = await analyze();

    expect(out.carryBlocks!.map(b => b.googleEventId)).toEqual(['evt-group']);
  });

  it('merges sibling blocks of a grouped category into one card with unique tasks', async () => {
    (getScheduledAsanaTasks as jest.Mock).mockResolvedValue([...GROUPED, ...SIBLING]);
    setContext(FRIDAY_EVENING, [{ gid: 'g-extra', name: 'Outline the deck' }]);

    const out = await analyze();

    // One card, not one per block — and no repeated member task.
    expect(out.carryBlocks).toHaveLength(1);
    const block = out.carryBlocks![0];
    expect(block.tasks.map(t => t.id)).toEqual(['g-open', 'g-done', 'g-extra']);
    expect(block.mergedEventIds).toEqual(['evt-group', 'evt-group-2']);
  });

  it('leaves a mid-week analyze untouched (no carry blocks, same moves/unplaceable)', async () => {
    setContext(WEDNESDAY);
    const out = await analyze();

    expect(out.endOfWeek).toBe(false);
    expect(out).not.toHaveProperty('carryBlocks');
    // The Monday block is still re-slotted into the remaining week as before.
    expect(out.moves).toHaveLength(1);
    expect(out.moves[0]).toEqual(
      expect.objectContaining({ googleEventId: 'evt-group', reason: 'missed' })
    );
    expect(out.unplaceable).toEqual([]);
  });
});
