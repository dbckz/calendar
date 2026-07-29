/**
 * Round-trip tests for the daily-review title-verdict store, focused on the
 * positive-verdict path added so the not-a-task classifier learns Dave's
 * confirmations (marking a calendar row) and not only his dismissals.
 */
import {
  getDailyReviewState,
  addDismissedReviewTitle,
  mergeReviewTitleVerdicts,
  confirmReviewTitleTasks,
} from '@/lib/user-data-storage';
import { __resetDbForTests } from '@/lib/storage/db';

describe('confirmReviewTitleTasks', () => {
  beforeEach(() => {
    __resetDbForTests();
  });

  it('records a permanent user isTask:true verdict for each reviewed title', async () => {
    await confirmReviewTitleTasks(['meet corinna', 'call rob']);
    const { titleVerdicts } = await getDailyReviewState();
    expect(titleVerdicts['meet corinna']).toMatchObject({ isTask: true, decidedBy: 'user' });
    expect(titleVerdicts['call rob']).toMatchObject({ isTask: true, decidedBy: 'user' });
  });

  it('never overwrites an explicit user dismissal (the stronger signal)', async () => {
    await addDismissedReviewTitle('Sophie', 'sophie'); // user isTask:false
    await confirmReviewTitleTasks(['sophie']);
    const { titleVerdicts } = await getDailyReviewState();
    // The dismissal stands.
    expect(titleVerdicts['sophie']).toMatchObject({ isTask: false, decidedBy: 'user' });
  });

  it('overrides a prior AI verdict (a user confirmation beats the AI)', async () => {
    await mergeReviewTitleVerdicts({
      standup: { isTask: false, decidedBy: 'ai', contentHash: 'h', promptVersion: 'v', updatedAt: 'x' },
    });
    await confirmReviewTitleTasks(['standup']);
    const { titleVerdicts } = await getDailyReviewState();
    expect(titleVerdicts['standup']).toMatchObject({ isTask: true, decidedBy: 'user' });
  });

  it('ignores blank titles and is a no-op for an empty list', async () => {
    await confirmReviewTitleTasks(['', '   ']);
    const { titleVerdicts } = await getDailyReviewState();
    expect(Object.keys(titleVerdicts)).toHaveLength(0);
  });
});
