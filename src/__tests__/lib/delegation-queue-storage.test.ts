/**
 * Round-trip tests for the delegation queue in user-data-storage.ts
 */
import {
  getAllDelegationEntries,
  getDelegationEntry,
  upsertDelegationEntry,
  claimNextDelegationEntry,
  deleteDelegationEntry,
} from '@/lib/user-data-storage';
import { __resetDbForTests } from '@/lib/storage/db';

describe('delegation queue storage', () => {
  beforeEach(() => {
    __resetDbForTests();
  });

  it('returns an empty map when no data exists', async () => {
    expect(await getAllDelegationEntries()).toEqual({});
    expect(await getDelegationEntry('nope')).toBeNull();
  });

  it('enqueues with defaults and reads back by GID', async () => {
    const entry = await upsertDelegationEntry('gid-1', 'int-1', { brief: 'Draft a memo', title: 'Memo' });

    expect(entry.asanaTaskGid).toBe('gid-1');
    expect(entry.brief).toBe('Draft a memo');
    expect(entry.state).toBe('queued'); // default on first insert
    expect(entry.mode).toBe('background'); // default
    expect(entry.priority).toBe(0);
    expect(entry.enqueuedAt).toBeTruthy();

    expect((await getDelegationEntry('gid-1'))?.title).toBe('Memo');
  });

  it('merges partial updates without dropping existing fields', async () => {
    await upsertDelegationEntry('gid-2', 'int-1', { brief: 'first', mode: 'now' });
    await upsertDelegationEntry('gid-2', 'int-1', { state: 'done' });

    const entry = await getDelegationEntry('gid-2');
    expect(entry?.brief).toBe('first');
    expect(entry?.mode).toBe('now');
    expect(entry?.state).toBe('done');
  });

  it('claims the oldest highest-priority queued entry and marks it running', async () => {
    await upsertDelegationEntry('a', 'int-1', { enqueuedAt: '2026-07-13T02:00:00.000Z', priority: 0 });
    await upsertDelegationEntry('b', 'int-1', { enqueuedAt: '2026-07-13T01:00:00.000Z', priority: 0 });
    await upsertDelegationEntry('c', 'int-1', { enqueuedAt: '2026-07-13T00:00:00.000Z', priority: 5 });

    // b is oldest among priority 0; c has worse (higher) priority despite being oldest overall.
    const claimed = await claimNextDelegationEntry();
    expect(claimed?.asanaTaskGid).toBe('b');
    expect(claimed?.state).toBe('running');
    expect(claimed?.startedAt).toBeTruthy();

    // b is now running, so the next claim skips it.
    expect((await claimNextDelegationEntry())?.asanaTaskGid).toBe('a');
  });

  it('returns null from claim when nothing is queued', async () => {
    await upsertDelegationEntry('done-1', 'int-1', { state: 'done' });
    expect(await claimNextDelegationEntry()).toBeNull();
  });

  it('deletes an entry by GID', async () => {
    await upsertDelegationEntry('gid-3', 'int-1', {});
    expect(await deleteDelegationEntry('gid-3')).toBe(true);
    expect(await getDelegationEntry('gid-3')).toBeNull();
    expect(await deleteDelegationEntry('gid-3')).toBe(false); // already gone
  });
});
