/**
 * @jest-environment node
 *
 * Tests that the plan-week candidates endpoint surfaces the carry-over flag and
 * floats carried tasks up their category (behind pinned priorities).
 */
jest.mock('@/lib/scheduling/gather', () => ({ gatherWeekContext: jest.fn() }));
jest.mock('@/lib/integration-storage', () => ({ getEnabledAsanaIntegrations: jest.fn() }));

import { POST } from '@/app/api/scheduling/candidates/route';
import { gatherWeekContext } from '@/lib/scheduling/gather';
import { getEnabledAsanaIntegrations } from '@/lib/integration-storage';
import type { WorkflowConfig } from '@/lib/workflow-config-storage';
import type { CandidateTask } from '@/lib/scheduling/types';

const mockGather = gatherWeekContext as jest.MockedFunction<typeof gatherWeekContext>;

const CONFIG: WorkflowConfig = {
  taskQuotas: { Writing: { weeklyCount: 3, targetLength: '60min', preferredTimes: [] } },
  typeMapping: { Writing: ['Writing'] },
  scheduling: {
    bufferBetweenTasks: '0min',
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    workingHours: { start: '09:00', end: '17:00' },
  },
  lastUpdated: '2026-07-12T00:00:00.000Z',
};

function setCandidates(candidateTasks: CandidateTask[]) {
  mockGather.mockResolvedValue({
    config: CONFIG,
    weekStartStr: '2026-07-20',
    weekEndStr: '2026-07-26',
    candidateTasks,
    quotas: [{ category: 'Writing', weeklyCount: 3, targetLength: '60min', types: ['Writing'] }],
    existingScheduledCounts: {},
    deferredCountsByCategory: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function candidates(body: any = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await POST({ json: async () => body } as any);
  return res.json();
}

const task = (over: Partial<CandidateTask> & { gid: string; title: string }): CandidateTask => ({
  typeSignals: ['Writing'],
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  (getEnabledAsanaIntegrations as jest.Mock).mockResolvedValue([]);
});

describe('candidates — carry-over surfacing', () => {
  it('exposes carriedOver / carriedFromWeek only for carried tasks', async () => {
    setCandidates([
      task({ gid: 'g-plain', title: 'Plain' }),
      task({ gid: 'g-carried', title: 'Carried', carriedOver: true, carriedFromWeek: '2026-07-13' }),
    ]);

    const out = await candidates();
    const byId = Object.fromEntries(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      out.categories[0].candidates.map((c: any) => [c.id, c])
    );
    expect(byId['g-carried']).toEqual(
      expect.objectContaining({ carriedOver: true, carriedFromWeek: '2026-07-13' })
    );
    expect(byId['g-plain']).not.toHaveProperty('carriedOver');
  });

  it('sorts priorities first, then carried-over, then the rest', async () => {
    setCandidates([
      task({ gid: 'g-plain', title: 'Plain' }),
      task({ gid: 'g-carried', title: 'Carried', carriedOver: true, carriedFromWeek: '2026-07-13' }),
      task({ gid: 'g-priority', title: 'Priority' }),
    ]);

    const out = await candidates({ priorityGids: ['g-priority'] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(out.categories[0].candidates.map((c: any) => c.id)).toEqual([
      'g-priority',
      'g-carried',
      'g-plain',
    ]);
  });
});
