/**
 * @jest-environment node
 *
 * The daily review's "didn't do" rewrite: the planned block's own event is
 * deleted (never a sweep) and, where the user said what they actually did, a
 * replacement is created in the same slot — attributed to the chosen workspace,
 * or pinned to count toward nothing for personal time. Plus the 'started'
 * outcome, which must leave the calendar completely alone.
 */
jest.mock('@/lib/google-calendar', () => ({
  createCalendarEvent: jest.fn(),
  deleteCalendarEvent: jest.fn(),
  updateCalendarEvent: jest.fn(),
  ensureValidCredentials: jest.fn(),
}));
jest.mock('@/lib/asana', () => ({ completeTask: jest.fn(), refreshAsanaToken: jest.fn() }));
jest.mock('@/lib/integration-storage', () => ({
  getEnabledGoogleIntegrations: jest.fn(),
  getGoogleIntegrationById: jest.fn(),
  getIntegrationById: jest.fn(),
  updateIntegration: jest.fn(),
}));
jest.mock('@/lib/workflow-config-storage', () => ({ getWorkflowConfig: jest.fn() }));
jest.mock('@/lib/scheduling/ritual-events', () => ({ createRitualEvent: jest.fn() }));
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
  setWeeklyTaskOutcomes: jest.fn(),
  setGoogleEventAttribution: jest.fn(),
  addEventAttributionRule: jest.fn(),
  updateScheduledAsanaTasksByGoogleEvent: jest.fn(),
}));

import { POST } from '@/app/api/scheduling/replan/confirm/route';
import { createCalendarEvent, deleteCalendarEvent, ensureValidCredentials } from '@/lib/google-calendar';
import { getEnabledGoogleIntegrations, getGoogleIntegrationById, getIntegrationById } from '@/lib/integration-storage';
import {
  getAdHocTasks,
  getPrepBlocks,
  getRitualBlocks,
  getScheduledAsanaTasks,
  unscheduleAsanaTask,
  setWeeklyTaskOutcomes,
  setGoogleEventAttribution,
  addEventAttributionRule,
} from '@/lib/user-data-storage';

const GOOGLE = { id: 'gi1', clientId: 'c', clientSecret: 's', credentials: { accessToken: 't' } };
const OM_GOOGLE = { id: 'gi-om', clientId: 'c', clientSecret: 's', credentials: { accessToken: 't' } };
const SLOT = { date: '2026-07-24', start: '09:00', durationMinutes: 60 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function confirm(body: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await POST({ json: async () => body } as any);
  return res.json();
}

beforeEach(() => {
  jest.clearAllMocks();
  (getEnabledGoogleIntegrations as jest.Mock).mockResolvedValue([GOOGLE]);
  (getGoogleIntegrationById as jest.Mock).mockImplementation(async (id: string) =>
    id === 'gi-om' ? OM_GOOGLE : GOOGLE
  );
  (ensureValidCredentials as jest.Mock).mockResolvedValue(GOOGLE.credentials);
  (createCalendarEvent as jest.Mock).mockResolvedValue({ id: 'evt-replacement' });
  (deleteCalendarEvent as jest.Mock).mockResolvedValue(undefined);
  (getAdHocTasks as jest.Mock).mockResolvedValue([]);
  (getPrepBlocks as jest.Mock).mockResolvedValue([]);
  (getRitualBlocks as jest.Mock).mockResolvedValue([]);
  (getScheduledAsanaTasks as jest.Mock).mockResolvedValue([
    { id: 's1', asanaTaskId: 'g1', googleEventId: 'evt-missed', googleIntegrationId: 'gi1' },
  ]);
  (getIntegrationById as jest.Mock).mockResolvedValue({
    id: 'asana-om',
    type: 'asana',
    name: 'OM',
    eventGoogleIntegrationId: 'gi-om',
  });
});

describe('review replacements — worked on something else', () => {
  it('deletes only the reviewed event and creates the replacement on the workspace calendar', async () => {
    const out = await confirm({
      moves: [],
      replacements: [
        {
          googleEventId: 'evt-missed',
          googleIntegrationId: 'gi1',
          ...SLOT,
          mode: 'work',
          title: 'Client firefighting',
          workspaceId: 'asana-om',
        },
      ],
    });

    // Exactly one deletion, of the reviewed block's own event.
    expect(deleteCalendarEvent).toHaveBeenCalledTimes(1);
    expect((deleteCalendarEvent as jest.Mock).mock.calls[0][3]).toBe('evt-missed');
    // Its stored schedule is cleared, so the task returns to the pool.
    expect(unscheduleAsanaTask).toHaveBeenCalledWith('s1');
    // The replacement lands in the same slot, titled as given.
    expect(createCalendarEvent).toHaveBeenCalledTimes(1);
    const call = (createCalendarEvent as jest.Mock).mock.calls[0];
    expect(call[3]).toBe('Client firefighting');
    expect((call[4] as Date).getHours()).toBe(9);
    expect(Math.round(((call[5] as Date).getTime() - (call[4] as Date).getTime()) / 60000)).toBe(60);
    // And it is pinned to the chosen workspace so it definitely counts there.
    expect(setGoogleEventAttribution).toHaveBeenCalledWith('evt-replacement', 'gi-om', 'asana-om');
    expect(out.replacementResults).toEqual([
      { googleEventId: 'evt-missed', deleted: true, replacementEventId: 'evt-replacement', success: true },
    ]);
  });
});

describe('review replacements — personal time', () => {
  it('creates the replacement and pins it to count toward nothing', async () => {
    await confirm({
      moves: [],
      replacements: [
        { googleEventId: 'evt-missed', googleIntegrationId: 'gi1', ...SLOT, mode: 'personal', title: 'Walk' },
      ],
    });

    expect((createCalendarEvent as jest.Mock).mock.calls[0][3]).toBe('Walk');
    expect(setGoogleEventAttribution).not.toHaveBeenCalled();
    expect(addEventAttributionRule).toHaveBeenCalledWith(
      expect.objectContaining({ recurringEventId: 'evt-replacement', asanaIntegrationId: 'none' })
    );
  });

  it('defaults the personal label when none is given', async () => {
    await confirm({
      moves: [],
      replacements: [{ googleEventId: 'evt-missed', ...SLOT, mode: 'personal' }],
    });
    expect((createCalendarEvent as jest.Mock).mock.calls[0][3]).toBe('Personal time');
  });
});

describe('review replacements — deletion only, and failures', () => {
  it('mode none deletes without creating anything', async () => {
    const out = await confirm({
      moves: [],
      replacements: [{ googleEventId: 'evt-missed', googleIntegrationId: 'gi1', ...SLOT, mode: 'none' }],
    });

    expect(deleteCalendarEvent).toHaveBeenCalledTimes(1);
    expect(createCalendarEvent).not.toHaveBeenCalled();
    expect(out.replacementResults[0]).toMatchObject({ deleted: true, success: true });
  });

  it('treats an already-gone event as deleted', async () => {
    (deleteCalendarEvent as jest.Mock).mockRejectedValue({ code: 404 });
    const out = await confirm({
      moves: [],
      replacements: [{ googleEventId: 'evt-missed', ...SLOT, mode: 'none' }],
    });
    expect(out.replacementResults[0]).toMatchObject({ deleted: true, success: true });
  });

  it('reports a deletion failure without aborting the rest of the apply', async () => {
    (deleteCalendarEvent as jest.Mock).mockRejectedValue(new Error('Google down'));

    const out = await confirm({
      moves: [],
      done: ['evt-other'],
      replacements: [{ googleEventId: 'evt-missed', ...SLOT, mode: 'none' }],
    });

    expect(out.replacementResults[0]).toMatchObject({ success: false, deleted: false });
    expect(out.replacementResults[0].error).toMatch(/Google down/);
    // The unrelated done marking still went through.
    expect(out.doneResults).toEqual([{ googleEventId: 'evt-other', success: true }]);
  });
});

describe('started outcome', () => {
  it('records started for the block\'s tasks and touches no calendar event', async () => {
    await confirm({ moves: [], started: ['evt-missed'] });

    const [, outcomes] = (setWeeklyTaskOutcomes as jest.Mock).mock.calls[0];
    expect(outcomes).toEqual([{ taskId: 'g1', outcome: 'started' }]);
    expect(deleteCalendarEvent).not.toHaveBeenCalled();
    expect(createCalendarEvent).not.toHaveBeenCalled();
    expect(unscheduleAsanaTask).not.toHaveBeenCalled();
  });
});
