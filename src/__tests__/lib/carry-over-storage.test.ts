/**
 * Round-trip tests for carry-over storage (the marker the end-of-week review
 * writes and the plan-week wizard reads) plus the pure partition that decides
 * which markers are badge-worthy and which are stale.
 */
import {
  getCarryOvers,
  setCarryOvers,
  removeCarryOvers,
  clearCarryOvers,
  markCarryOversScheduled,
  setCarryOverMustDo,
} from '@/lib/user-data-storage';
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
      gid1: { fromWeek: '2026-07-13', at: 111, carries: 1 },
      adhoc2: { fromWeek: '2026-07-13', at: 222, carries: 1 },
    });
  });

  it('upserts an existing carry-over to the newer week and counts the streak', async () => {
    await setCarryOvers([{ taskId: 'gid1', fromWeek: '2026-07-13', at: 1 }]);
    await setCarryOvers([{ taskId: 'gid1', fromWeek: '2026-07-20', at: 2 }]);
    expect(await getCarryOvers()).toEqual({
      gid1: { fromWeek: '2026-07-20', at: 2, carries: 2 },
    });
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

describe('carry streaks across the schedule → not-done → carry cycle', () => {
  beforeEach(() => __resetDbForTests());

  it('keeps counting when a carried task is scheduled and then carried again', async () => {
    // Week 1 ends: the task is carried for the first time.
    await setCarryOvers([{ taskId: 'gid1', fromWeek: '2026-07-13' }]);
    expect((await getCarryOvers()).gid1.carries).toBe(1);

    // The wizard schedules it into week 2. The marker must SURVIVE — clearing it
    // here is what used to destroy the streak.
    await markCarryOversScheduled(['gid1'], '2026-07-20');
    const afterScheduling = (await getCarryOvers()).gid1;
    expect(afterScheduling).toMatchObject({ carries: 1, scheduledWeek: '2026-07-20' });

    // Week 2 ends and it still isn't done: the streak continues.
    await setCarryOvers([{ taskId: 'gid1', fromWeek: '2026-07-20' }]);
    expect((await getCarryOvers()).gid1).toMatchObject({
      carries: 2,
      fromWeek: '2026-07-20',
    });

    // And again.
    await markCarryOversScheduled(['gid1'], '2026-07-27');
    await setCarryOvers([{ taskId: 'gid1', fromWeek: '2026-07-27' }]);
    expect((await getCarryOvers()).gid1.carries).toBe(3);
  });

  it('is idempotent within one week — carrying twice out of the same week counts once', async () => {
    await setCarryOvers([{ taskId: 'gid1', fromWeek: '2026-07-13' }]);
    await setCarryOvers([{ taskId: 'gid1', fromWeek: '2026-07-13' }]);
    expect((await getCarryOvers()).gid1.carries).toBe(1);
  });

  it('resets the streak when the task is completed', async () => {
    await setCarryOvers([{ taskId: 'gid1', fromWeek: '2026-07-13' }]);
    await setCarryOvers([{ taskId: 'gid1', fromWeek: '2026-07-20' }]);
    // Completion removes the marker outright.
    await removeCarryOvers(['gid1']);
    expect(await getCarryOvers()).toEqual({});

    // A later carry starts from one again.
    await setCarryOvers([{ taskId: 'gid1', fromWeek: '2026-07-27' }]);
    expect((await getCarryOvers()).gid1.carries).toBe(1);
  });

  it('marks scheduling a no-op for a task that was never carried', async () => {
    await markCarryOversScheduled(['stranger'], '2026-07-20');
    expect(await getCarryOvers()).toEqual({});
  });

  it('records and clears the must-do flag', async () => {
    await setCarryOvers([{ taskId: 'gid1', fromWeek: '2026-07-13', mustDo: true }]);
    expect((await getCarryOvers()).gid1.mustDo).toBe(true);

    await setCarryOverMustDo(['gid1'], false);
    expect((await getCarryOvers()).gid1.mustDo).toBe(false);

    await setCarryOverMustDo(['gid1'], true);
    expect((await getCarryOvers()).gid1.mustDo).toBe(true);
    // Carrying again keeps the flag and still advances the streak.
    await setCarryOvers([{ taskId: 'gid1', fromWeek: '2026-07-20' }]);
    expect((await getCarryOvers()).gid1).toMatchObject({ mustDo: true, carries: 2 });
  });
});

describe('partitionCarryOvers — streak and must-do surfacing', () => {
  it('reports the streak and must-do flag for badge-worthy entries', () => {
    const { carried } = partitionCarryOvers(
      {
        streaky: { fromWeek: '2026-07-13', at: 0, carries: 3, mustDo: true },
        fresh: { fromWeek: '2026-07-13', at: 0 },
        sameWeek: { fromWeek: '2026-07-20', at: 0, carries: 5 },
      },
      '2026-07-20'
    );

    expect(carried.get('streaky')).toEqual({ fromWeek: '2026-07-13', carries: 3, mustDo: true });
    // No stored streak means it has been carried once.
    expect(carried.get('fresh')).toEqual({ fromWeek: '2026-07-13', carries: 1, mustDo: false });
    // Carried out of the week being planned: not a badge, so not reported.
    expect(carried.has('sameWeek')).toBe(false);
  });
});
