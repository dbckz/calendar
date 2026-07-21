/**
 * Round-trip tests for task-deferral storage in user-data-storage.ts — the
 * storage path exercised by the replan confirm route's `defer` input.
 */
import { promises as fs } from 'fs';
import {
  getTaskDeferrals,
  setTaskDeferrals,
  removeTaskDeferrals,
} from '@/lib/user-data-storage';

jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    mkdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
  },
}));

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('task deferral storage', () => {
  let backingFile: string | null;

  beforeEach(() => {
    backingFile = null;
    (mockedFs.access as jest.Mock).mockResolvedValue(undefined);
    (mockedFs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (mockedFs.readFile as jest.Mock).mockImplementation(async () => {
      if (backingFile === null) {
        const err = new Error('ENOENT') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
      }
      return backingFile;
    });
    (mockedFs.writeFile as jest.Mock).mockImplementation(async (_path, data) => {
      backingFile = data as string;
    });
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
    (mockedFs.writeFile as jest.Mock).mockClear();
    await setTaskDeferrals([]);
    expect(mockedFs.writeFile).not.toHaveBeenCalled();
  });
});
