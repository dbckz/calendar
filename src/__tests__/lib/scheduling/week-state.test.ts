/**
 * The week-state machine behind the dashboard's single adaptive planning button:
 * every state, the never-planned edge, and the helpers that decide "is the
 * end-of-week review done" / "which week does this action target".
 */
import {
  deriveWeekAction,
  isEndOfWeekReviewDone,
  lastWorkingDayOfWeek,
  targetWeekForAction,
  WEEK_ACTION_LABELS,
  type WeekStateInput,
} from '@/lib/scheduling/week-state';

const base: WeekStateInput = {
  currentWeekPlanned: false,
  endOfWeek: false,
  endOfWeekReviewDone: false,
  nextWeekPlanned: false,
  hasReviewableBlocks: false,
};

describe('deriveWeekAction', () => {
  it('1: nothing planned mid-week → plan this week', () => {
    expect(deriveWeekAction({ ...base })).toBe('plan-this-week');
  });

  it('2: planned mid-week → replan', () => {
    expect(
      deriveWeekAction({ ...base, currentWeekPlanned: true, hasReviewableBlocks: true })
    ).toBe('replan');
  });

  it('3: end of week with the review outstanding → wrap up', () => {
    expect(
      deriveWeekAction({
        ...base,
        currentWeekPlanned: true,
        endOfWeek: true,
        hasReviewableBlocks: true,
      })
    ).toBe('wrap-up');
  });

  it('4: end of week, review done, next week unplanned → plan next week', () => {
    expect(
      deriveWeekAction({
        ...base,
        currentWeekPlanned: true,
        endOfWeek: true,
        endOfWeekReviewDone: true,
        hasReviewableBlocks: true,
      })
    ).toBe('plan-next-week');
  });

  it('5: end of week with next week already planned → replan next week', () => {
    expect(
      deriveWeekAction({
        ...base,
        currentWeekPlanned: true,
        endOfWeek: true,
        endOfWeekReviewDone: true,
        nextWeekPlanned: true,
        hasReviewableBlocks: true,
      })
    ).toBe('replan-next-week');
  });

  it('5: an existing next-week plan beats an outstanding review', () => {
    expect(
      deriveWeekAction({
        ...base,
        currentWeekPlanned: true,
        endOfWeek: true,
        endOfWeekReviewDone: false,
        nextWeekPlanned: true,
        hasReviewableBlocks: true,
      })
    ).toBe('replan-next-week');
  });

  it('edge: end of week but the week was never planned → straight to plan next week', () => {
    expect(deriveWeekAction({ ...base, endOfWeek: true })).toBe('plan-next-week');
  });

  it('edge: end of week, planned, but nothing has ended yet → no wrap-up gate', () => {
    expect(
      deriveWeekAction({ ...base, endOfWeek: true, currentWeekPlanned: true })
    ).toBe('plan-next-week');
  });

  it('every action has copy and a target week', () => {
    for (const action of [
      'plan-this-week',
      'replan',
      'wrap-up',
      'plan-next-week',
      'replan-next-week',
    ] as const) {
      expect(WEEK_ACTION_LABELS[action].label).toBeTruthy();
      expect(['current', 'next']).toContain(targetWeekForAction(action));
    }
    expect(targetWeekForAction('plan-next-week')).toBe('next');
    expect(targetWeekForAction('replan-next-week')).toBe('next');
    expect(targetWeekForAction('replan')).toBe('current');
  });
});

describe('lastWorkingDayOfWeek', () => {
  const MONDAY = new Date(2026, 6, 13); // 2026-07-13

  it('is Friday for a Mon–Fri week', () => {
    expect(lastWorkingDayOfWeek(MONDAY)).toBe('2026-07-17');
  });

  it('honours a shorter or longer working week', () => {
    expect(lastWorkingDayOfWeek(MONDAY, ['Monday', 'Tuesday', 'Wednesday', 'Thursday'])).toBe(
      '2026-07-16'
    );
    expect(
      lastWorkingDayOfWeek(MONDAY, ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])
    ).toBe('2026-07-18');
  });
});

describe('isEndOfWeekReviewDone', () => {
  const MONDAY = new Date(2026, 6, 13);

  it('is false with no review, an unparseable stamp, or a mid-week review', () => {
    expect(isEndOfWeekReviewDone(undefined, MONDAY)).toBe(false);
    expect(isEndOfWeekReviewDone('not a date', MONDAY)).toBe(false);
    // Wednesday's review does not close out the week.
    expect(isEndOfWeekReviewDone(new Date(2026, 6, 15, 18, 0).toISOString(), MONDAY)).toBe(false);
  });

  it('is true once a review lands on or after the last working day', () => {
    expect(isEndOfWeekReviewDone(new Date(2026, 6, 17, 9, 0).toISOString(), MONDAY)).toBe(true);
    expect(isEndOfWeekReviewDone(new Date(2026, 6, 19, 22, 0).toISOString(), MONDAY)).toBe(true);
  });

  it('follows the configured working days', () => {
    const thursdayEvening = new Date(2026, 6, 16, 19, 0).toISOString();
    const shortWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday'];
    expect(isEndOfWeekReviewDone(thursdayEvening, MONDAY)).toBe(false);
    expect(isEndOfWeekReviewDone(thursdayEvening, MONDAY, shortWeek)).toBe(true);
  });
});
