/**
 * Round-trip tests for wellbeing storage. The rules worth pinning down are the
 * ones that protect the record: a skip must carry a reason, and re-running the
 * day's review must not wipe an answer already given.
 */
import {
  addExperimentCheckIn,
  createExperiment,
  deleteExperiment,
  getWellbeingDay,
  getWellbeingDays,
  listExperiments,
  saveWellbeingDay,
  updateExperiment,
} from '@/lib/storage/wellbeing';
import { __resetDbForTests } from '@/lib/storage/db';

describe('wellbeing day storage', () => {
  beforeEach(() => {
    __resetDbForTests();
  });

  it('starts empty', async () => {
    expect(await getWellbeingDays()).toEqual([]);
  });

  it('saves a day of answers', async () => {
    const day = await saveWellbeingDay({
      date: '2026-08-06',
      habits: [
        { habitId: 'meditate', done: true },
        { habitId: 'morning-pages', done: false, reason: 'Overslept' },
      ],
      notes: '  Long day  ',
    });

    expect(day.habits).toHaveLength(2);
    expect(day.notes).toBe('Long day');
    expect(await getWellbeingDay('2026-08-06')).toEqual(day);
  });

  it('refuses a skip without a reason', async () => {
    await expect(
      saveWellbeingDay({
        date: '2026-08-06',
        habits: [{ habitId: 'meditate', done: false, reason: '   ' }],
      })
    ).rejects.toThrow(/why/i);
    expect(await getWellbeingDay('2026-08-06')).toBeNull();
  });

  it('refuses an unknown habit', async () => {
    await expect(
      saveWellbeingDay({ date: '2026-08-06', habits: [{ habitId: 'journal', done: true }] })
    ).rejects.toThrow(/Unknown habit/);
  });

  it('refuses a malformed date', async () => {
    await expect(saveWellbeingDay({ date: '6 Aug', habits: [] })).rejects.toThrow(/yyyy-MM-dd/);
  });

  it('merges a later answer into the same day rather than replacing it', async () => {
    await saveWellbeingDay({
      date: '2026-08-06',
      habits: [{ habitId: 'meditate', done: true }],
    });
    const day = await saveWellbeingDay({
      date: '2026-08-06',
      habits: [{ habitId: 'morning-pages', done: false, reason: 'Ran out of time' }],
    });

    expect(day.habits).toHaveLength(2);
    expect(day.habits.find(h => h.habitId === 'meditate')?.done).toBe(true);
  });

  it('overwrites an answer for a habit already answered that day', async () => {
    await saveWellbeingDay({
      date: '2026-08-06',
      habits: [{ habitId: 'meditate', done: false, reason: 'Overslept' }],
    });
    const day = await saveWellbeingDay({
      date: '2026-08-06',
      habits: [{ habitId: 'meditate', done: true }],
    });

    const log = day.habits.find(h => h.habitId === 'meditate');
    expect(log?.done).toBe(true);
    // A reason left over from the earlier "no" would be misleading.
    expect(log?.reason).toBeUndefined();
  });

  it('leaves the note alone when none is sent, and clears it on an empty string', async () => {
    await saveWellbeingDay({ date: '2026-08-06', habits: [], notes: 'Tired' });

    const untouched = await saveWellbeingDay({
      date: '2026-08-06',
      habits: [{ habitId: 'meditate', done: true }],
    });
    expect(untouched.notes).toBe('Tired');

    const cleared = await saveWellbeingDay({ date: '2026-08-06', habits: [], notes: '' });
    expect(cleared.notes).toBeUndefined();
  });

  it('filters by date range, oldest first', async () => {
    await saveWellbeingDay({ date: '2026-08-05', habits: [{ habitId: 'meditate', done: true }] });
    await saveWellbeingDay({ date: '2026-08-07', habits: [{ habitId: 'meditate', done: true }] });
    await saveWellbeingDay({ date: '2026-08-09', habits: [{ habitId: 'meditate', done: true }] });

    const days = await getWellbeingDays('2026-08-06', '2026-08-08');
    expect(days.map(d => d.date)).toEqual(['2026-08-07']);
    expect((await getWellbeingDays()).map(d => d.date)).toEqual([
      '2026-08-05',
      '2026-08-07',
      '2026-08-09',
    ]);
  });
});

describe('experiment storage', () => {
  beforeEach(() => {
    __resetDbForTests();
  });

  const create = () =>
    createExperiment({
      title: '  No screens before 8am  ',
      protocol: 'Phone stays in the kitchen',
      startDate: '2026-08-01',
      endDate: '2026-08-28',
    });

  it('creates an experiment as planned by default', async () => {
    const experiment = await create();
    expect(experiment.title).toBe('No screens before 8am');
    expect(experiment.status).toBe('planned');
    expect(experiment.checkIns).toEqual([]);
  });

  it('refuses an experiment without a title', async () => {
    await expect(createExperiment({ title: '  ' })).rejects.toThrow(/title/);
  });

  it('refuses an end date before the start', async () => {
    await expect(
      createExperiment({ title: 'Cold showers', startDate: '2026-08-10', endDate: '2026-08-01' })
    ).rejects.toThrow(/endDate/);
  });

  it('patches only the keys it is sent', async () => {
    const experiment = await create();
    const updated = await updateExperiment(experiment.id, { hypothesis: 'Calmer mornings' });

    expect(updated?.hypothesis).toBe('Calmer mornings');
    expect(updated?.protocol).toBe('Phone stays in the kitchen');
  });

  it('clears a field when sent an empty string', async () => {
    const experiment = await create();
    const updated = await updateExperiment(experiment.id, { protocol: '' });
    expect(updated?.protocol).toBeUndefined();
  });

  it('rejects an unknown status or verdict', async () => {
    const experiment = await create();
    await expect(
      updateExperiment(experiment.id, { status: 'paused' as never })
    ).rejects.toThrow(/status/);
    await expect(
      updateExperiment(experiment.id, { verdict: 'great' as never })
    ).rejects.toThrow(/verdict/);
  });

  it('returns null for an experiment that does not exist', async () => {
    expect(await updateExperiment('nope', { title: 'x' })).toBeNull();
    expect(await addExperimentCheckIn('nope', { rating: 3 })).toBeNull();
    expect(await deleteExperiment('nope')).toBe(false);
  });

  it('starts a planned experiment on its first check-in', async () => {
    const experiment = await create();
    const updated = await addExperimentCheckIn(experiment.id, { rating: 4, note: '  Going well  ' });

    expect(updated?.status).toBe('running');
    expect(updated?.checkIns).toHaveLength(1);
    expect(updated?.checkIns[0].note).toBe('Going well');
  });

  it('leaves a completed experiment completed when checked in on', async () => {
    const experiment = await create();
    await updateExperiment(experiment.id, { status: 'complete', verdict: 'worked' });
    const updated = await addExperimentCheckIn(experiment.id, { note: 'One more thought' });

    expect(updated?.status).toBe('complete');
  });

  it('rejects an out-of-range rating and an empty check-in', async () => {
    const experiment = await create();
    await expect(addExperimentCheckIn(experiment.id, { rating: 9 })).rejects.toThrow(/1 to 5/);
    await expect(addExperimentCheckIn(experiment.id, { note: '  ' })).rejects.toThrow(
      /rating or a note/
    );
  });

  it('lists newest first and filters by status', async () => {
    const first = await create();
    const second = await createExperiment({ title: 'Cold showers', status: 'running' });

    const all = await listExperiments();
    expect(all.map(e => e.id)).toEqual([second.id, first.id]);
    expect((await listExperiments('running')).map(e => e.id)).toEqual([second.id]);
  });

  it('deletes an experiment', async () => {
    const experiment = await create();
    expect(await deleteExperiment(experiment.id)).toBe(true);
    expect(await listExperiments()).toEqual([]);
  });
});
