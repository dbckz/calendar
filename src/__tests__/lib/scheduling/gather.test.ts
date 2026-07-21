/**
 * Tests for gatherWeekContext's week-scoped candidate exclusion — the mechanism
 * behind grouped-block (and single-task) rollover: a task scheduled in a PRIOR
 * week is not `inWeek` for the current planning week, so it stays a candidate and
 * can be selected again; a task scheduled IN the current week is excluded. All
 * I/O (config, storage, Asana, Google) is mocked so the test is deterministic.
 */
import { gatherWeekContext } from '@/lib/scheduling/gather';
import { getScheduledAsanaTasks, getAdHocTasks, getCustomTaskTypes, getAllTaskMetadata, getPrepBlocks, getRitualBlocks, getTaskDeferrals, removeTaskDeferrals } from '@/lib/user-data-storage';
import { getEnabledAsanaIntegrations, getEnabledGoogleIntegrations } from '@/lib/integration-storage';
import { getIncompleteTasks } from '@/lib/asana';
import { getWorkflowConfig } from '@/lib/workflow-config-storage';
import type { AdHocTask, AsanaTask, ScheduledAsanaTask } from '@/types';

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
  getTaskDeferrals: jest.fn().mockResolvedValue({}),
  removeTaskDeferrals: jest.fn().mockResolvedValue(0),
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

  it('holds an actively-deferred task out of the candidate pool and counts it', async () => {
    (getWorkflowConfig as jest.Mock).mockResolvedValue({
      taskQuotas: { Engage: { weeklyCount: 2, targetLength: '1h' } },
      typeMapping: { Engage: ['engage'] },
    });
    // 'rollover' resumes next Monday (after this week's Sunday end) -> still deferred.
    (getTaskDeferrals as jest.Mock).mockResolvedValue({ rollover: '2026-07-20' });

    const ctx = await gatherWeekContext();
    const gids = ctx.candidateTasks.map(t => t.gid);
    expect(gids).not.toContain('rollover');
    expect(ctx.deferredCountsByCategory.Engage).toBe(1);
  });

  it('prunes an expired deferral and lets the task return as a candidate', async () => {
    (getTaskDeferrals as jest.Mock).mockResolvedValue({ rollover: '2026-07-15' }); // within this week -> expired

    const ctx = await gatherWeekContext();
    const gids = ctx.candidateTasks.map(t => t.gid);
    expect(gids).toContain('rollover');
    expect(removeTaskDeferrals).toHaveBeenCalledWith(['rollover']);
  });
});

describe('gatherWeekContext - existing block counts dedupe across record types', () => {
  const batchAsanaTask = (gid: string): AsanaTask => ({
    id: gid,
    gid,
    name: `Batch ${gid}`,
    completed: false,
    customFields: [{ name: 'Type', displayValue: 'batch' } as never],
  });
  const scheduledOn = (asanaTaskId: string, eventId: string): ScheduledAsanaTask => ({
    id: `s-${asanaTaskId}-${eventId}`,
    asanaTaskId,
    scheduledDate: '2026-07-15',
    scheduledTime: '13:00',
    duration: 30,
    googleEventId: eventId,
  });
  const adhoc = (id: string, googleEventId?: string): AdHocTask => ({
    id,
    title: `Ad-hoc ${id}`,
    completed: false,
    priority: 'medium',
    taskType: 'batch', // built-in "Batch" -> classifies to the Batch category
    dueDate: '2026-07-15',
    dueTime: '13:00',
    duration: 30,
    googleEventId,
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T00:00:00.000Z',
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 15, 9, 0, 0));

    (getWorkflowConfig as jest.Mock).mockResolvedValue({
      taskQuotas: { Batch: { weeklyCount: 2, targetLength: '30min' } },
      typeMapping: { Batch: ['batch'] },
    });
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
  });

  afterEach(() => jest.useRealTimers());

  it('counts a mixed Asana + ad-hoc grouped block (one shared event) as 1', async () => {
    // A Batch container event carries one Asana task and one ad-hoc task, both
    // pointing at the SAME googleEventId. That is ONE block, not two.
    (getScheduledAsanaTasks as jest.Mock).mockResolvedValue([scheduledOn('a1', 'evt-batch')]);
    (getAdHocTasks as jest.Mock).mockResolvedValue([adhoc('ad1', 'evt-batch')]);
    (getIncompleteTasks as jest.Mock).mockResolvedValue([batchAsanaTask('a1')]);

    const ctx = await gatherWeekContext();
    expect(ctx.existingScheduledCounts.Batch).toBe(1);
  });

  it('counts an ad-hoc-only grouped block (one shared event) as 1', async () => {
    // Two ad-hoc tasks recorded against the SAME container event -> 1 block.
    (getScheduledAsanaTasks as jest.Mock).mockResolvedValue([]);
    (getAdHocTasks as jest.Mock).mockResolvedValue([
      adhoc('ad1', 'evt-batch'),
      adhoc('ad2', 'evt-batch'),
    ]);
    (getIncompleteTasks as jest.Mock).mockResolvedValue([]);

    const ctx = await gatherWeekContext();
    expect(ctx.existingScheduledCounts.Batch).toBe(1);
  });

  it('still counts ad-hoc tasks with no event id as separate blocks', async () => {
    (getScheduledAsanaTasks as jest.Mock).mockResolvedValue([]);
    (getAdHocTasks as jest.Mock).mockResolvedValue([adhoc('ad1'), adhoc('ad2')]);
    (getIncompleteTasks as jest.Mock).mockResolvedValue([]);

    const ctx = await gatherWeekContext();
    expect(ctx.existingScheduledCounts.Batch).toBe(2);
  });
});
