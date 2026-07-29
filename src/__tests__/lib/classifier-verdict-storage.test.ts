/**
 * Round-trip tests for the two new user-verdict stores that let the Type and
 * reminder-triage classifiers learn from Dave's own decisions.
 */
import {
  getTypeVerdicts,
  setTypeVerdicts,
  getReminderVerdicts,
  setReminderVerdicts,
} from '@/lib/user-data-storage';
import { __resetDbForTests } from '@/lib/storage/db';

beforeEach(() => {
  __resetDbForTests();
});

describe('type verdicts', () => {
  it('stores a decided label per title, flagging overrides', async () => {
    await setTypeVerdicts([
      { key: 'engage reutersinstitute', type: 'Engagement', override: true },
      { key: 'draft the brief', type: 'Writing/Deep Work' },
    ]);
    const v = await getTypeVerdicts();
    expect(v['engage reutersinstitute']).toMatchObject({ type: 'Engagement', override: true });
    // No override flag stored when it was an accepted suggestion.
    expect(v['draft the brief']).toMatchObject({ type: 'Writing/Deep Work' });
    expect(v['draft the brief'].override).toBeUndefined();
  });

  it('lets a later decision for the same title win', async () => {
    await setTypeVerdicts([{ key: 'ambiguous task', type: 'Admin' }]);
    await setTypeVerdicts([{ key: 'ambiguous task', type: 'Engagement', override: true }]);
    const v = await getTypeVerdicts();
    expect(v['ambiguous task']).toMatchObject({ type: 'Engagement', override: true });
  });

  it('skips blank keys and labels', async () => {
    await setTypeVerdicts([{ key: '  ', type: 'Admin' }, { key: 'x', type: '' }]);
    expect(Object.keys(await getTypeVerdicts())).toHaveLength(0);
  });
});

describe('reminder verdicts', () => {
  it('stores keep with no routing, and convert with its destination', async () => {
    await setReminderVerdicts([
      { key: 'go to dry cleaner', action: 'keep', integrationId: 'ai1' },
      { key: 'draft partnerships proposal', action: 'convert', integrationId: 'ai1', projectGid: 'p1', taskType: 'Writing' },
    ]);
    const v = await getReminderVerdicts();
    // A 'keep' carries no routing, even if an integrationId was passed.
    expect(v['go to dry cleaner']).toEqual(expect.objectContaining({ action: 'keep' }));
    expect(v['go to dry cleaner'].integrationId).toBeUndefined();
    // A 'convert' keeps where it was filed.
    expect(v['draft partnerships proposal']).toMatchObject({
      action: 'convert',
      integrationId: 'ai1',
      projectGid: 'p1',
      taskType: 'Writing',
    });
  });

  it('lets a later decision for the same title win', async () => {
    await setReminderVerdicts([{ key: 'watch this video', action: 'convert', integrationId: 'ai1' }]);
    await setReminderVerdicts([{ key: 'watch this video', action: 'keep' }]);
    const v = await getReminderVerdicts();
    expect(v['watch this video']).toMatchObject({ action: 'keep' });
  });
});
