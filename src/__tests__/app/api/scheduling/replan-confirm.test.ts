/**
 * @jest-environment node
 *
 * Tests for the replan confirm route's "prioritise tomorrow" displacement path:
 * a victim block's calendar event is deleted, its stored schedule cleared, and
 * its tasks deferred to next week — while the prioritised block rides the normal
 * move path into the freed slot. All module boundaries are mocked so the route
 * runs pure.
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
jest.mock('@/lib/scheduling/rituals', () => ({ ritualIntegrationIdForBlock: jest.fn() }));

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
  updateScheduledAsanaTasksByGoogleEvent: jest.fn(),
}));

import { POST } from '@/app/api/scheduling/replan/confirm/route';
import { createCalendarEvent, deleteCalendarEvent, updateCalendarEvent, ensureValidCredentials } from '@/lib/google-calendar';
import { getEnabledGoogleIntegrations, getGoogleIntegrationById } from '@/lib/integration-storage';
import {
  getAdHocTasks,
  getPrepBlocks,
  getRitualBlocks,
  getScheduledAsanaTasks,
  addPrepBlock,
  unscheduleAsanaTask,
  updateAdHocTask,
  setTaskDeferrals,
  removeBlockDoneOverride,
  removeGoogleEventAttribution,
  updateScheduledAsanaTasksByGoogleEvent,
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
  (getScheduledAsanaTasks as jest.Mock).mockResolvedValue([
    { id: 's-thu', asanaTaskId: 'g-thu', googleEventId: 'evt-thu' },
  ]);
  (updateScheduledAsanaTasksByGoogleEvent as jest.Mock).mockResolvedValue(1);
  (deleteCalendarEvent as jest.Mock).mockResolvedValue(undefined);
  (updateCalendarEvent as jest.Mock).mockResolvedValue(undefined);
});

describe('replan confirm — prioritise tomorrow (displace)', () => {
  it('deletes the victim event, unschedules it, defers its tasks and moves the prioritised block in', async () => {
    const out = await confirm({
      displace: [
        {
          googleEventId: 'evt-thu',
          googleIntegrationId: 'gi1',
          taskIds: ['g-thu'],
          mode: 'defer',
          durationMinutes: 90,
          priorityDurationMinutes: 90,
        },
      ],
      moves: [
        { googleEventId: 'evt-missed', googleIntegrationId: 'gi1', date: '2026-07-16', start: '09:00', durationMinutes: 90 },
      ],
    });

    // Victim event removed and its stored schedule cleared.
    expect(deleteCalendarEvent).toHaveBeenCalledTimes(1);
    expect((deleteCalendarEvent as jest.Mock).mock.calls[0][3]).toBe('evt-thu');
    expect(unscheduleAsanaTask).toHaveBeenCalledWith('s-thu');
    // Tasks deferred to next week (server-computed date, so just assert the task id).
    expect(setTaskDeferrals).toHaveBeenCalledTimes(1);
    expect((setTaskDeferrals as jest.Mock).mock.calls[0][0]).toEqual([
      expect.objectContaining({ taskId: 'g-thu' }),
    ]);
    expect(removeBlockDoneOverride).toHaveBeenCalledWith('evt-thu');
    expect(removeGoogleEventAttribution).toHaveBeenCalledWith('evt-thu');

    // Prioritised block patched into the freed slot.
    expect((updateCalendarEvent as jest.Mock).mock.calls[0][3]).toBe('evt-missed');

    expect(out.displaceResults).toEqual([{ googleEventId: 'evt-thu', success: true }]);
    expect(out.results).toEqual([{ googleEventId: 'evt-missed', success: true }]);
  });

  it("leaves a victim's tasks in the pool (no deferral) when mode is 'leave'", async () => {
    await confirm({
      displace: [
        {
          googleEventId: 'evt-thu',
          googleIntegrationId: 'gi1',
          taskIds: ['g-thu'],
          mode: 'leave',
          durationMinutes: 60,
          priorityDurationMinutes: 60,
        },
      ],
      moves: [],
    });

    expect(unscheduleAsanaTask).toHaveBeenCalledWith('s-thu');
    expect(setTaskDeferrals).not.toHaveBeenCalled();
    expect(removeBlockDoneOverride).toHaveBeenCalledWith('evt-thu');
  });

  it('rejects a victim too short to hold the prioritised block', async () => {
    const out = await confirm({
      displace: [
        {
          googleEventId: 'evt-thu',
          googleIntegrationId: 'gi1',
          taskIds: ['g-thu'],
          mode: 'defer',
          durationMinutes: 30,
          priorityDurationMinutes: 90,
        },
      ],
      moves: [],
    });

    // Nothing displaced: the victim's slot is too small.
    expect(deleteCalendarEvent).not.toHaveBeenCalled();
    expect(unscheduleAsanaTask).not.toHaveBeenCalled();
    expect(setTaskDeferrals).not.toHaveBeenCalled();
    expect(out.displaceResults).toHaveLength(1);
    expect(out.displaceResults[0]).toMatchObject({ googleEventId: 'evt-thu', success: false });
  });

  it('clears the ad-hoc schedule for an ad-hoc victim', async () => {
    (getScheduledAsanaTasks as jest.Mock).mockResolvedValue([]);
    (getAdHocTasks as jest.Mock).mockResolvedValue([{ id: 'ah1', googleEventId: 'evt-adhoc' }]);

    await confirm({
      displace: [
        {
          googleEventId: 'evt-adhoc',
          googleIntegrationId: 'gi1',
          taskIds: ['ah1'],
          mode: 'defer',
          durationMinutes: 60,
          priorityDurationMinutes: 60,
        },
      ],
      moves: [],
    });

    expect(updateAdHocTask).toHaveBeenCalledWith('ah1', {
      googleEventId: undefined,
      dueDate: undefined,
      dueTime: undefined,
    });
    expect(setTaskDeferrals).toHaveBeenCalledTimes(1);
  });
});

describe('replan confirm — prep additions (early-next-week meetings)', () => {
  it('creates a "📖 Prep:" event and a linked PrepBlock for an accepted prep addition', async () => {
    (createCalendarEvent as jest.Mock).mockResolvedValue({ id: 'evt-prep-new' });

    const out = await confirm({
      additions: [
        {
          id: 'add-prep-1',
          kind: 'prep',
          category: 'Meeting prep',
          date: '2026-07-17',
          start: '15:00',
          durationMinutes: 15,
          reason: 'Prep for "Board review"',
          meeting: {
            eventId: 'evt-next-mon',
            title: 'Board review',
            meetingStart: '2026-07-20T10:00:00.000Z',
          },
        },
      ],
    });

    expect(createCalendarEvent).toHaveBeenCalledTimes(1);
    // Title carries the prep prefix built from the meeting title.
    expect((createCalendarEvent as jest.Mock).mock.calls[0][3]).toBe('📖 Prep: Board review');
    // PrepBlock record links to the (next-week) meeting so the morning briefing finds it.
    expect(addPrepBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        googleEventId: 'evt-prep-new',
        meetingEventId: 'evt-next-mon',
        meetingTitle: 'Board review',
        meetingStart: '2026-07-20T10:00:00.000Z',
        date: '2026-07-17',
        start: '15:00',
        durationMinutes: 15,
      })
    );
    expect(out.additionResults).toEqual([
      { id: 'add-prep-1', success: true, googleEventId: 'evt-prep-new' },
    ]);
  });
});
