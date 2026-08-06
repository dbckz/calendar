/**
 * Tests for the local "Type" store (getLocalTaskTypes / setLocalTaskTypes) and
 * the pure overlay helper (overlayLocalType) that synthesizes a Type custom
 * field for locally-typed tasks so every existing Type reader works unchanged.
 */
import { promises as fs } from 'fs';

import { getLocalTaskTypes, setLocalTaskTypes } from '@/lib/local-task-types';
import { overlayLocalType, LOCAL_TYPE_FIELD_GID } from '@/lib/local-task-types-shared';
import type { AsanaCustomField } from '@/types';

// Mock fs the same way the other storage libs' tests do.
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    mkdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
  },
}));

const mockFs = fs as jest.Mocked<typeof fs>;

// Read back whatever the last writeFile persisted (as the parsed JSON object).
function lastWritten(): { version: number; types: Record<string, string> } {
  const calls = mockFs.writeFile.mock.calls;
  return JSON.parse(calls[calls.length - 1][1] as string);
}

describe('local-task-types store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFs.access.mockResolvedValue(undefined); // data dir + file exist by default
    mockFs.writeFile.mockResolvedValue(undefined);
  });

  it('returns an empty map when the file does not exist', async () => {
    mockFs.readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    expect(await getLocalTaskTypes()).toEqual({});
  });

  it('returns an empty map for a malformed file', async () => {
    mockFs.readFile.mockResolvedValue('not json');
    expect(await getLocalTaskTypes()).toEqual({});
  });

  it('reads back a stored map, dropping non-string / empty entries', async () => {
    mockFs.readFile.mockResolvedValue(
      JSON.stringify({ version: 1, types: { a: 'Blogs', b: '', c: 42, d: 'Batch' } })
    );
    expect(await getLocalTaskTypes()).toEqual({ a: 'Blogs', d: 'Batch' });
  });

  it('writes new associations and persists version 1', async () => {
    mockFs.readFile.mockRejectedValue(new Error('no file'));
    const merged = await setLocalTaskTypes({ gid1: 'Blogs', gid2: 'Batch' });
    expect(merged).toEqual({ gid1: 'Blogs', gid2: 'Batch' });
    expect(lastWritten()).toEqual({ version: 1, types: { gid1: 'Blogs', gid2: 'Batch' } });
  });

  it('merges updates into the existing map', async () => {
    mockFs.readFile.mockResolvedValue(JSON.stringify({ version: 1, types: { gid1: 'Blogs' } }));
    const merged = await setLocalTaskTypes({ gid2: 'Batch' });
    expect(merged).toEqual({ gid1: 'Blogs', gid2: 'Batch' });
  });

  it('deletes an entry when the update value is null or empty', async () => {
    mockFs.readFile.mockResolvedValue(
      JSON.stringify({ version: 1, types: { gid1: 'Blogs', gid2: 'Batch', gid3: 'Writing' } })
    );
    const merged = await setLocalTaskTypes({ gid1: null, gid2: '', gid3: 'Reading' });
    expect(merged).toEqual({ gid3: 'Reading' });
    expect(lastWritten().types).toEqual({ gid3: 'Reading' });
  });
});

describe('overlayLocalType', () => {
  const localTypes = { dbc1: 'Blogs' };

  it('leaves fields untouched when the task has no local type', () => {
    const cf: AsanaCustomField[] = [{ gid: 'x', name: 'Priority', displayValue: 'High', type: 'enum' }];
    expect(overlayLocalType('other', cf, localTypes)).toBe(cf);
  });

  it('leaves fields untouched when gid is undefined', () => {
    expect(overlayLocalType(undefined, undefined, localTypes)).toBeUndefined();
  });

  it('prepends a synthesized Type field for a locally-typed task with no fields', () => {
    const result = overlayLocalType('dbc1', undefined, localTypes);
    expect(result).toEqual([
      { gid: LOCAL_TYPE_FIELD_GID, name: 'Type', displayValue: 'Blogs', type: 'enum' },
    ]);
  });

  it('prepends the synthesized field ahead of an existing empty Type field', () => {
    const cf: AsanaCustomField[] = [{ gid: 'real', name: 'Type', displayValue: null, type: 'enum' }];
    const result = overlayLocalType('dbc1', cf, localTypes)!;
    // The synthesized field is found first by readers (so the local Type wins),
    // while the real field is still present for writable-field derivation.
    expect(result[0].gid).toBe(LOCAL_TYPE_FIELD_GID);
    expect(result.find(f => f.name.toLowerCase() === 'type')!.displayValue).toBe('Blogs');
    expect(result).toHaveLength(2);
  });

  it('lets a real Asana Type value win over the local one', () => {
    const cf: AsanaCustomField[] = [
      { gid: 'real', name: 'Type', displayValue: 'Engagement / Outreach', type: 'enum' },
    ];
    expect(overlayLocalType('dbc1', cf, localTypes)).toBe(cf);
  });
});
