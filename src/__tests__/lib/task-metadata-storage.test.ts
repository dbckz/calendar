/**
 * Round-trip tests for task metadata storage in user-data-storage.ts
 */
import { promises as fs } from 'fs';
import { getAllTaskMetadata, upsertTaskMetadata } from '@/lib/user-data-storage';

jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    mkdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
  },
}));

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('task metadata storage', () => {
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

  it('returns an empty map when no data exists', async () => {
    const metadata = await getAllTaskMetadata();
    expect(metadata).toEqual({});
  });

  it('upserts and reads back metadata by GID', async () => {
    const saved = await upsertTaskMetadata('gid-1', 'int-1', {
      energyLevel: 'high',
      aiDelegable: true,
      deadlineType: 'hard',
      effortMinutes: 60,
    });

    expect(saved.asanaTaskGid).toBe('gid-1');
    expect(saved.integrationId).toBe('int-1');
    expect(saved.energyLevel).toBe('high');
    expect(saved.updatedAt).toBeTruthy();

    const all = await getAllTaskMetadata();
    expect(all['gid-1'].aiDelegable).toBe(true);
    expect(all['gid-1'].deadlineType).toBe('hard');
    expect(all['gid-1'].effortMinutes).toBe(60);
  });

  it('merges partial updates without dropping existing fields', async () => {
    await upsertTaskMetadata('gid-2', 'int-1', { energyLevel: 'low' });
    await upsertTaskMetadata('gid-2', 'int-1', { bestTime: 'morning' });

    const all = await getAllTaskMetadata();
    expect(all['gid-2'].energyLevel).toBe('low');
    expect(all['gid-2'].bestTime).toBe('morning');
  });
});
