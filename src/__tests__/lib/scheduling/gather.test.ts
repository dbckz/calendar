/**
 * Tests for gatherWeekContext's week-scoped candidate exclusion — the mechanism
 * behind grouped-block (and single-task) rollover: a task scheduled in a PRIOR
 * week is not `inWeek` for the current planning week, so it stays a candidate and
 * can be selected again; a task scheduled IN the current week is excluded. All
 * I/O (config, storage, Asana, Google) is mocked so the test is deterministic.
 */
import { gatherWeekContext } from '@/lib/scheduling/gather';
import { getScheduledAsanaTasks, getAdHocTasks, getCustomTaskTypes, getAllTaskMetadata, getPrepBlocks, getRitualBlocks } from '@/lib/user-data-storage';
import { getEnabledAsanaIntegrations, getEnabledGoogleIntegrations } from '@/lib/integration-storage';
import { getIncompleteTasks } from '@/lib/asana';
import { getWorkflowConfig } from '@/lib/workflow-config-storage';
import type { AsanaTask, ScheduledAsanaTask } from '@/types';

jest.mock('@/lib/workflow-config-storage', () => ({ getWorkflowConfig: jest.fn() }));
jest.mock('@/lib/user-data-storage', () => ({
  getScheduledAsanaTasks: jest.fn(),
  getAdHocTasks: jest.fn(),
  getCustomTaskTypes: jest.fn(),
  getAllTaskMetadata: jest.fn(),
  getPrepBlocks: jest.fn(),
  getRitualBlocks: jest.fn(),
  unscheduleAsanaTask: jest.fn(),
  updateAdHocTask: jest.fn(),
  deletePrepBlock: jest.fn(),
  deleteRitualBlock: jest.fn(),
  removeGoogleEventAttribution: jest.fn(),
}));
jest.mock('@/lib/integration-storage', () => ({
  getEnabledAsanaIntegrations: jest.fn(),
  getEnabledGoogleIntegrations: jest.fn(),
  updateIntegration: jest.fn(),
}));
jest.mock('@/lib/asana', () => ({ getIncompleteTasks: jest.fn(), refreshAsanaToken: jest.fn() }));

const asanaTask = (gid: string, name: string): AsanaTask => ({
  id: gid,
  gid,
  name,
  completed: false,
  customFields: [{ name: 'Type', displayValue: 'engage' } as never],
});
const scheduled = (asanaTaskId: string, scheduledDate: string): ScheduledAsanaTask => ({
  id: `s-${asanaTaskId}`,
  asanaTaskId,
  scheduledDate,
  scheduledTime: '13:00',
  duration: 60,
  googleEventId: `evt-${scheduledDate}`,
});

describe('gatherWeekContext - week-scoped rollover', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Wednesday 2026-07-15 -> planning week is Mon 2026-07-13 .. Sun 2026-07-19.
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 15, 9, 0, 0));

    (getWorkflowConfig as jest.Mock).mockResolvedValue({ taskQuotas: {}, typeMapping: {} });
    (getScheduledAsanaTasks as jest.Mock).mockResolvedValue([
      scheduled('inweek', '2026-07-15'), // scheduled this week -> excluded
      scheduled('rollover', '2026-07-06'), // scheduled last week -> rolls over
    ]);
    (getAdHocTasks as jest.Mock).mockResolvedValue([]);
    (getCustomTaskTypes as jest.Mock).mockResolvedValue([]);
    (getAllTaskMetadata as jest.Mock).mockResolvedValue({});
    (getPrepBlocks as jest.Mock).mockResolvedValue([]);
    (getRitualBlocks as jest.Mock).mockResolvedValue([]);
    (getEnabledGoogleIntegrations as jest.Mock).mockResolvedValue([]);
    (getEnabledAsanaIntegrations as jest.Mock).mockResolvedValue([
      {
        id: 'int1',
        clientId: 'c',
        clientSecret: 's',
        workspaceId: 'ws',
        credentials: { accessToken: 'tok', expiresAt: Date.now() + 3_600_000 },
      },
    ]);
    (getIncompleteTasks as jest.Mock).mockResolvedValue([
      asanaTask('inweek', 'Outreach A'),
      asanaTask('rollover', 'Outreach B'),
    ]);
  });

  afterEach(() => jest.useRealTimers());

  it('excludes an in-week-scheduled task but keeps a prior-week one as a candidate', async () => {
    const ctx = await gatherWeekContext();
    const gids = ctx.candidateTasks.map(t => t.gid);
    expect(gids).toContain('rollover'); // incomplete last-week task is selectable again
    expect(gids).not.toContain('inweek'); // already scheduled this week -> not a candidate
  });
});
