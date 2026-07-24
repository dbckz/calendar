/**
 * Round-trip tests for carry-over storage (the marker the end-of-week review
 * writes and the plan-week wizard reads) plus the pure partition that decides
 * which markers are badge-worthy and which are stale.
 */
import { getCarryOvers, setCarryOvers, removeCarryOvers, clearCarryOvers } from '@/lib/user-data-storage';
import { partitionCarryOvers } from '@/lib/scheduling/carry-overs';
import * as db from '@/lib/storage/db';
import { __resetDbForTests } from '@/lib/storage/db';

describe('carry-over storage', () => {
  beforeEach(() => {
    __resetDbForTests();
    jest.restoreAllMocks();
  });

  it('returns an empty map when nothing is carried over', async () => {
    expect(await getCarryOvers()).toEqual({});
  });

  it('sets and reads back carry-overs with a timestamp', async () => {
    await setCarryOvers([
      { taskId: 'gid1', fromWeek: '2026-07-13', at: 111 },
      { taskId: 'adhoc2', fromWeek: '2026-07-13', at: 222 },
    ]);
    expect(await getCarryOvers()).toEqual({
      gid1: { fromWeek: '2026-07-13', at: 111 },
      adhoc2: { fromWeek: '2026-07-13', at: 222 },
    });
  });

  it('upserts an existing carry-over to the newer week', async () => {
    await setCarryOvers([{ taskId: 'gid1', fromWeek: '2026-07-13', at: 1 }]);
    await setCarryOvers([{ taskId: 'gid1', fromWeek: '2026-07-20', at: 2 }]);
    expect(await getCarryOvers()).toEqual({ gid1: { fromWeek: '2026-07-20', at: 2 } });
  });

  it('removes carry-overs by task id and reports the count', async () => {
    await setCarryOvers([
      { taskId: 'gid1', fromWeek: '2026-07-13' },
      { taskId: 'gid2', fromWeek: '2026-07-13' },
    ]);
    expect(await removeCarryOvers(['gid1', 'missing'])).toBe(1);
    expect(Object.keys(await getCarryOvers())).toEqual(['gid2']);
  });

  it('clears every carry-over', async () => {
    await setCarryOvers([{ taskId: 'gid1', fromWeek: '2026-07-13' }]);
    await clearCarryOvers();
    expect(await getCarryOvers()).toEqual({});
  });

  it('setCarryOvers with no entries does not write', async () => {
    const writeSpy = jest.spyOn(db, 'writeAllDomains');
    await setCarryOvers([]);
    expect(writeSpy).not.toHaveBeenCalled();
  });
});

describe('partitionCarryOvers', () => {
  const WEEK = '2026-07-20'; // the week being planned

  it('badges a task carried out of an earlier week', () => {
    const { carriedFromWeek, stale } = partitionCarryOvers(
      { gid1: { fromWeek: '2026-07-13', at: 0 } },
      WEEK
    );
    expect(carriedFromWeek.get('gid1')).toBe('2026-07-13');
    expect(stale).toEqual([]);
  });

  it('does not badge a task carried out of the week being planned', () => {
    const { carriedFromWeek, stale } = partitionCarryOvers(
      { gid1: { fromWeek: WEEK, at: 0 } },
      WEEK
    );
    expect(carriedFromWeek.size).toBe(0);
    expect(stale).toEqual([]);
  });

  it('prunes entries older than four weeks', () => {
    const { carriedFromWeek, stale } = partitionCarryOvers(
      {
        old: { fromWeek: '2026-06-15', at: 0 }, // 5 weeks before
        edge: { fromWeek: '2026-06-22', at: 0 }, // exactly 4 weeks before — kept
        broken: { fromWeek: '', at: 0 },
      },
      WEEK
    );
    expect(stale.sort()).toEqual(['broken', 'old']);
    expect(carriedFromWeek.get('edge')).toBe('2026-06-22');
  });
});
