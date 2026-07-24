/**
 * @jest-environment node
 *
 * Tests for the replan confirm route's end-of-week `carry` action: a carried
 * task gets both a carry-over marker and the normal deferral past the weekend,
 * "back to backlog" writes neither, grouped blocks carry only the selected
 * members, and ritual / prep blocks are refused outright.
 */
jest.mock('@/lib/google-calendar', () => ({
  createCalendarEvent: jest.fn(),
  deleteCalendarEvent: jest.fn(),
  updateCalendarEvent: jest.fn(),
  ensureValidCredentials: jest.fn(),
}));

jest.mock('@/lib/asana', () => ({
  completeTask: jest.fn(),
  refreshAsanaToken: jest.fn(),
}));

jest.mock('@/lib/integration-storage', () => ({
  getEnabledGoogleIntegrations: jest.fn(),
  getGoogleIntegrationById: jest.fn(),
  getIntegrationById: jest.fn(),
  updateIntegration: jest.fn(),
}));

jest.mock('@/lib/workflow-config-storage', () => ({ getWorkflowConfig: jest.fn() }));
jest.mock('@/lib/scheduling/ritual-events', () => ({ createRitualEvent: jest.fn() }));
// Ritual identity stays REAL here: the carry path uses isRitualLikeTitle to
// refuse a ritual that an earlier review adopted as an ad-hoc task.
jest.mock('@/lib/scheduling/rituals', () => ({
  ...jest.requireActual('@/lib/scheduling/rituals'),
  ritualIntegrationIdForBlock: jest.fn(),
}));

jest.mock('@/lib/user-data-storage', () => ({
  getAdHocTasks: jest.fn(),
  getPrepBlocks: jest.fn(),
  getRitualBlocks: jest.fn(),
  getScheduledAsanaTasks: jest.fn(),
  addAdHocTask: jest.fn(),
  addPrepBlock: jest.fn(),
  updateAdHocTask: jest.fn(),
  updatePrepBlock: jest.fn(),
  deletePrepBlock: jest.fn(),
  deleteRitualBlock: jest.fn(),
  unscheduleAsanaTask: jest.fn(),
  scheduleAsanaTask: jest.fn(),
  setBlockDoneOverride: jest.fn(),
  removeGoogleEventAttribution: jest.fn(),
  removeBlockDoneOverride: jest.fn(),
  setTaskDeferrals: jest.fn(),
  setCarryOvers: jest.fn(),
  removeCarryOvers: jest.fn(),
  updateScheduledAsanaTasksByGoogleEvent: jest.fn(),
}));

import { POST } from '@/app/api/scheduling/replan/confirm/route';
import { ensureValidCredentials } from '@/lib/google-calendar';
import { completeTask } from '@/lib/asana';
import { getEnabledGoogleIntegrations, getGoogleIntegrationById, getIntegrationById } from '@/lib/integration-storage';
import {
  getAdHocTasks,
  getPrepBlocks,
  getRitualBlocks,
  getScheduledAsanaTasks,
  setTaskDeferrals,
  setCarryOvers,
  removeCarryOvers,
  removeBlockDoneOverride,
} from '@/lib/user-data-storage';

const INTEGRATION = { id: 'gi1', clientId: 'c', clientSecret: 's', credentials: { accessToken: 't' } };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function confirm(body: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await POST({ json: async () => body } as any);
  return res.json();
}

beforeEach(() => {
  jest.clearAllMocks();
  (getEnabledGoogleIntegrations as jest.Mock).mockResolvedValue([INTEGRATION]);
  (getGoogleIntegrationById as jest.Mock).mockResolvedValue(INTEGRATION);
  (ensureValidCredentials as jest.Mock).mockResolvedValue(INTEGRATION.credentials);
  (getAdHocTasks as jest.Mock).mockResolvedValue([]);
  (getPrepBlocks as jest.Mock).mockResolvedValue([]);
  (getRitualBlocks as jest.Mock).mockResolvedValue([]);
  (getScheduledAsanaTasks as jest.Mock).mockResolvedValue([]);
});

describe('replan confirm — end-of-week carry-over', () => {
  it('writes a carry-over marker AND a deferral, and clears the block override', async () => {
    const out = await confirm({
      moves: [],
      carry: [{ blockId: 'evt-1', taskIds: ['g1'] }],
    });

    expect((setCarryOvers as jest.Mock).mock.calls[0][0]).toEqual([
      expect.objectContaining({ taskId: 'g1' }),
    ]);
    // fromWeek is the Monday of the CURRENT week (server-computed).
    const fromWeek = (setCarryOvers as jest.Mock).mock.calls[0][0][0].fromWeek;
    expect(fromWeek).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(`${fromWeek}T00:00:00`).getDay()).toBe(1);
    // The task is also parked past the weekend so a weekend replan skips it.
    const until = (setTaskDeferrals as jest.Mock).mock.calls[0][0][0].until;
    expect(new Date(`${until}T00:00:00`).getTime()).toBeGreaterThan(
      new Date(`${fromWeek}T00:00:00`).getTime()
    );
    expect(removeBlockDoneOverride).toHaveBeenCalledWith('evt-1');
    expect(out.carryResults).toEqual([
      { blockId: 'evt-1', taskIds: ['g1'], success: true },
    ]);
  });

  it('"back to backlog" (quiet) writes no marker and no deferral', async () => {
    await confirm({ moves: [], carry: [{ blockId: 'evt-1', taskIds: ['g1'], quiet: true }] });

    expect(setCarryOvers).not.toHaveBeenCalled();
    expect(setTaskDeferrals).not.toHaveBeenCalled();
    // Any stale marker from a previous week is dropped.
    expect(removeCarryOvers).toHaveBeenCalledWith(['g1']);
    expect(removeBlockDoneOverride).toHaveBeenCalledWith('evt-1');
  });

  it('carries only the selected members of a grouped block', async () => {
    await confirm({
      moves: [],
      carry: [
        { blockId: 'evt-group', taskIds: ['g1', 'g3'] },
        { blockId: 'evt-group', taskIds: ['g2'], quiet: true },
      ],
    });

    expect((setCarryOvers as jest.Mock).mock.calls[0][0].map((e: { taskId: string }) => e.taskId)).toEqual([
      'g1',
      'g3',
    ]);
    expect((setTaskDeferrals as jest.Mock).mock.calls[0][0].map((e: { taskId: string }) => e.taskId)).toEqual([
      'g1',
      'g3',
    ]);
    expect(removeCarryOvers).toHaveBeenCalledWith(['g2']);
  });

  it('carries a task from a MERGED card whose tasks span several sibling blocks', async () => {
    // The card's tasks come from two blocks; the payload sends the primary block
    // id plus every merged one. Carry is applied per task id, so it must not
    // matter which block a given task actually belongs to.
    const out = await confirm({
      moves: [],
      carry: [
        {
          blockId: 'evt-group',
          blockIds: ['evt-group', 'evt-group-2'],
          taskIds: ['g-from-block-1', 'g-from-block-2'],
        },
      ],
    });

    expect((setCarryOvers as jest.Mock).mock.calls[0][0].map((e: { taskId: string }) => e.taskId)).toEqual([
      'g-from-block-1',
      'g-from-block-2',
    ]);
    expect((setTaskDeferrals as jest.Mock).mock.calls[0][0].map((e: { taskId: string }) => e.taskId)).toEqual([
      'g-from-block-1',
      'g-from-block-2',
    ]);
    // Every block behind the card has its planning override cleared.
    expect(removeBlockDoneOverride).toHaveBeenCalledWith('evt-group');
    expect(removeBlockDoneOverride).toHaveBeenCalledWith('evt-group-2');
    expect(out.carryResults).toEqual([
      { blockId: 'evt-group', taskIds: ['g-from-block-1', 'g-from-block-2'], success: true },
    ]);
  });

  it('refuses a merged card when ANY block behind it is a ritual or prep block', async () => {
    (getRitualBlocks as jest.Mock).mockResolvedValue([{ id: 'r1', googleEventId: 'evt-ritual' }]);

    const out = await confirm({
      moves: [],
      carry: [{ blockId: 'evt-group', blockIds: ['evt-group', 'evt-ritual'], taskIds: ['g1'] }],
    });

    expect(setCarryOvers).not.toHaveBeenCalled();
    expect(out.carryResults[0].success).toBe(false);
  });

  it('refuses to carry a ritual or a meeting-prep block', async () => {
    (getRitualBlocks as jest.Mock).mockResolvedValue([{ id: 'r1', googleEventId: 'evt-ritual' }]);
    (getPrepBlocks as jest.Mock).mockResolvedValue([{ id: 'p1', googleEventId: 'evt-prep' }]);

    const out = await confirm({
      moves: [],
      carry: [
        { blockId: 'evt-ritual', taskIds: ['r-task'] },
        { blockId: 'evt-prep', taskIds: ['p-task'] },
      ],
    });

    expect(setCarryOvers).not.toHaveBeenCalled();
    expect(setTaskDeferrals).not.toHaveBeenCalled();
    expect(out.carryResults.map((r: { success: boolean }) => r.success)).toEqual([false, false]);
    expect(out.carryResults[0].error).toMatch(/Ritual/);
    expect(out.carryResults[1].error).toMatch(/prep/i);
  });

  it('refuses to carry an ad-hoc task that is really a ritual, whatever the client sends', async () => {
    (getAdHocTasks as jest.Mock).mockResolvedValue([
      { id: 'adhoc-emails', title: 'Emails', googleEventId: 'evt-emails' },
      { id: 'adhoc-real', title: 'Email triage', googleEventId: 'evt-triage' },
    ]);

    const out = await confirm({
      moves: [],
      carry: [{ blockId: 'evt-mixed', taskIds: ['adhoc-emails', 'adhoc-real'] }],
    });

    expect((setCarryOvers as jest.Mock).mock.calls[0][0].map((e: { taskId: string }) => e.taskId)).toEqual([
      'adhoc-real',
    ]);
    expect(out.carryResults[0].taskIds).toEqual(['adhoc-real']);
  });

  it('clears the carry-over marker when a task is completed in Asana', async () => {
    (getIntegrationById as jest.Mock).mockResolvedValue({
      id: 'ai1',
      type: 'asana',
      clientId: 'c',
      clientSecret: 's',
      credentials: { accessToken: 'tok' },
    });
    await confirm({ moves: [], completeAsana: [{ gid: 'g9', integrationId: 'ai1' }] });

    expect(completeTask).toHaveBeenCalledWith('tok', 'g9', true);
    expect(removeCarryOvers).toHaveBeenCalledWith(['g9']);
  });
});
