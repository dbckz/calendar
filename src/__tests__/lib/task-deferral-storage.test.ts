/**
 * Round-trip tests for task-deferral storage in user-data-storage.ts — the
 * storage path exercised by the replan confirm route's `defer` input.
 */
import {
  getTaskDeferrals,
  setTaskDeferrals,
  removeTaskDeferrals,
} from '@/lib/user-data-storage';
import * as db from '@/lib/storage/db';
import { __resetDbForTests } from '@/lib/storage/db';

describe('task deferral storage', () => {
  beforeEach(() => {
    __resetDbForTests();
    jest.restoreAllMocks();
  });

  it('returns an empty map when nothing is deferred', async () => {
    expect(await getTaskDeferrals()).toEqual({});
  });

  it('sets and reads back deferrals', async () => {
    await setTaskDeferrals([
      { taskId: 'gid1', until: '2026-07-27' },
      { taskId: 'adhoc2', until: '2026-07-27' },
    ]);
    expect(await getTaskDeferrals()).toEqual({ gid1: '2026-07-27', adhoc2: '2026-07-27' });
  });

  it('upserts an existing deferral to a new date', async () => {
    await setTaskDeferrals([{ taskId: 'gid1', until: '2026-07-27' }]);
    await setTaskDeferrals([{ taskId: 'gid1', until: '2026-08-03' }]);
    expect(await getTaskDeferrals()).toEqual({ gid1: '2026-08-03' });
  });

  it('removes deferrals by task id and reports the count', async () => {
    await setTaskDeferrals([
      { taskId: 'gid1', until: '2026-07-27' },
      { taskId: 'gid2', until: '2026-07-27' },
    ]);
    const removed = await removeTaskDeferrals(['gid1', 'missing']);
    expect(removed).toBe(1);
    expect(await getTaskDeferrals()).toEqual({ gid2: '2026-07-27' });
  });

  it('setTaskDeferrals with no entries does not write', async () => {
    const writeSpy = jest.spyOn(db, 'writeAllDomains');
    await setTaskDeferrals([]);
    expect(writeSpy).not.toHaveBeenCalled();
  });
});
