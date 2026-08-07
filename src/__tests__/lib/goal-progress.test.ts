/**
 * @jest-environment node
 *
 * Pacing decides what the bars say and what the nudge card interrupts about, so
 * the bands matter: too tight and an ordinary week reads as failure, too loose
 * and a dead goal never surfaces.
 */
import {
  buildNudges,
  buildScorecard,
  computeProgress,
  suggestVerdict,
} from '@/lib/goal-progress';
import type { Goal, GoalWithProgress } from '@/types/life';

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    sectionId: 'work',
    periodKind: 'month',
    periodKey: '2026-08',
    title: 'Ship six briefs',
    target: { value: 6, unit: 'briefs' },
    evidence: { kind: 'manual' },
    checkIns: [],
    status: 'active',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

// Roughly half way through August 2026.
const MID_MONTH = new Date(2026, 7, 16, 12);

describe('computeProgress', () => {
  it('paces against a straight line through the period', () => {
    const progress = computeProgress(makeGoal(), { actual: 3, label: '3 done' }, MID_MONTH);
    expect(progress.expected).toBeCloseTo(3, 0);
    expect(progress.actual).toBe(3);
    expect(progress.completion).toBeCloseTo(0.5, 1);
    expect(progress.pace).toBe('on-track');
  });

  it('calls a goal behind only once it is outside the tolerance', () => {
    // 2/6 at the half-way mark is 0.33 against 0.5 — outside the 0.15 band.
    expect(computeProgress(makeGoal(), { actual: 2, label: '' }, MID_MONTH).pace).toBe('behind');
    // 2.5/6 would be 0.42, inside the band; use 5 as the clear ahead case.
    expect(computeProgress(makeGoal(), { actual: 5, label: '' }, MID_MONTH).pace).toBe('ahead');
  });

  it('never calls a completed goal behind, however early it landed', () => {
    const early = new Date(2026, 7, 3);
    expect(computeProgress(makeGoal(), { actual: 6, label: '' }, early).pace).toBe('ahead');
  });

  it('reports no-target and no-data rather than guessing', () => {
    const noTarget = makeGoal({ target: undefined });
    expect(computeProgress(noTarget, { actual: 4, label: '' }, MID_MONTH).pace).toBe('no-target');
    expect(computeProgress(makeGoal(), { actual: null, label: '' }, MID_MONTH).pace).toBe('no-data');
  });

  it('treats zero progress with no check-ins as no evidence', () => {
    expect(computeProgress(makeGoal(), { actual: 0, label: '' }, MID_MONTH).noEvidence).toBe(true);
    expect(computeProgress(makeGoal(), { actual: 1, label: '' }, MID_MONTH).noEvidence).toBe(false);
  });

  it('a check-in counts as evidence even with no numbers', () => {
    const goal = makeGoal({
      checkIns: [{ at: '2026-08-10T00:00:00.000Z', status: 'on-track', source: 'weekly-review' }],
    });
    const progress = computeProgress(goal, { actual: null, label: '' }, MID_MONTH);
    expect(progress.noEvidence).toBe(false);
    expect(progress.lastCheckIn?.status).toBe('on-track');
  });
});

describe('computeProgress with a progression plan', () => {
  // A back-loaded plan: only 2 of 6 due by mid-month, the rest late. This is the
  // case a straight line gets wrong — 2/6 at half-way looks 'behind' linearly but
  // is exactly on the plan.
  const planned = makeGoal({
    plan: [
      { key: '2026-08-16', value: 2, label: 'two by mid-month' },
      { key: '2026-08-31', value: 6, label: 'six by month end' },
    ],
    planSource: 'ai',
  });

  it('paces against the milestone ramp, not the straight line', () => {
    // 2/6 at mid-month is behind the linear 0.5 but on the plan's back-loaded curve.
    const onPlan = computeProgress(planned, { actual: 2, label: '' }, MID_MONTH);
    expect(onPlan.expected).toBeCloseTo(2, 0);
    expect(onPlan.pace).toBe('on-track');

    // The same 2/6 with no plan reads behind, on the straight line.
    const linear = computeProgress(makeGoal(), { actual: 2, label: '' }, MID_MONTH);
    expect(linear.pace).toBe('behind');
  });

  it('interpolates before the first milestone from the period start', () => {
    // 5 Aug is early: expected should be well under the first milestone's 2.
    const early = computeProgress(planned, { actual: 0, label: '' }, new Date(2026, 7, 5, 12));
    expect(early.expected).toBeLessThan(2);
    expect(early.expected).toBeGreaterThan(0);
  });

  it('holds at the last milestone after it, when there is no target beyond it', () => {
    const noTarget = makeGoal({
      target: undefined,
      plan: [{ key: '2026-08-10', value: 4, label: 'four early' }],
    });
    // Late in the month, past the only milestone: expected stays at 4.
    const late = computeProgress(noTarget, { actual: 4, label: '' }, new Date(2026, 7, 25));
    expect(late.expected).toBe(4);
  });

  it('surfaces the next milestone still ahead', () => {
    const progress = computeProgress(planned, { actual: 1, label: '' }, new Date(2026, 7, 10));
    expect(progress.nextMilestone?.key).toBe('2026-08-16');
  });
});

describe('buildNudges', () => {
  const item = (goal: Goal, actual: number | null, now = MID_MONTH): GoalWithProgress => ({
    goal,
    progress: computeProgress(goal, { actual, label: '' }, now),
  });

  it('stays quiet in the first half of a period', () => {
    const early = new Date(2026, 7, 4);
    expect(buildNudges([item(makeGoal(), 0, early)])).toHaveLength(0);
  });

  it('flags a goal past halfway with nothing to show', () => {
    const nudges = buildNudges([item(makeGoal(), 0)]);
    expect(nudges).toHaveLength(1);
    expect(nudges[0].reason).toBe('no-evidence');
  });

  it('flags a behind-pace goal that does have some progress', () => {
    const nudges = buildNudges([item(makeGoal(), 1)]);
    expect(nudges[0].reason).toBe('behind');
  });

  it('ranks stalled above no-evidence above behind', () => {
    const stalled = makeGoal({
      id: 'stalled',
      checkIns: [{ at: '2026-08-12T00:00:00.000Z', status: 'stalled', source: 'weekly-review' }],
    });
    const nudges = buildNudges([
      item(makeGoal({ id: 'behind' }), 1),
      item(makeGoal({ id: 'empty' }), 0),
      item(stalled, 2),
    ]);
    expect(nudges.map(n => n.reason)).toEqual(['stalled', 'no-evidence', 'behind']);
  });

  it('ignores goals that are already closed out', () => {
    expect(buildNudges([item(makeGoal({ status: 'missed' }), 0)])).toHaveLength(0);
  });
});

describe('suggestVerdict', () => {
  const verdictFor = (goal: Goal, actual: number | null) =>
    suggestVerdict(goal, computeProgress(goal, { actual, label: '' }, new Date(2026, 8, 1)));

  it('derives hit / partial / missed from completion', () => {
    expect(verdictFor(makeGoal(), 6)).toBe('hit');
    expect(verdictFor(makeGoal(), 3)).toBe('partial');
    expect(verdictFor(makeGoal(), 1)).toBe('missed');
  });

  it('keeps a verdict already recorded in a reflection', () => {
    expect(verdictFor(makeGoal({ status: 'partial' }), 6)).toBe('partial');
    expect(verdictFor(makeGoal({ status: 'dropped' }), 6)).toBe('dropped');
  });

  it('falls back to the last check-in when there is no target', () => {
    const noTarget = makeGoal({ target: undefined });
    expect(verdictFor(noTarget, null)).toBe('unknown');

    const withCheckIn = makeGoal({
      target: undefined,
      checkIns: [{ at: '2026-08-28T00:00:00.000Z', status: 'on-track', source: 'reflection' }],
    });
    expect(verdictFor(withCheckIn, null)).toBe('hit');
  });
});

describe('buildScorecard', () => {
  it('counts verdicts and excludes dropped goals from the scored total', () => {
    const now = new Date(2026, 8, 1);
    const rows: GoalWithProgress[] = [
      { goal: makeGoal({ id: 'a' }), progress: computeProgress(makeGoal({ id: 'a' }), { actual: 6, label: '' }, now) },
      { goal: makeGoal({ id: 'b' }), progress: computeProgress(makeGoal({ id: 'b' }), { actual: 3, label: '' }, now) },
      { goal: makeGoal({ id: 'c' }), progress: computeProgress(makeGoal({ id: 'c' }), { actual: 0, label: '' }, now) },
      {
        goal: makeGoal({ id: 'd', status: 'dropped' }),
        progress: computeProgress(makeGoal({ id: 'd', status: 'dropped' }), { actual: 0, label: '' }, now),
      },
    ];

    const scorecard = buildScorecard('month', '2026-08', rows);
    expect(scorecard.hit).toBe(1);
    expect(scorecard.partial).toBe(1);
    expect(scorecard.missed).toBe(1);
    expect(scorecard.dropped).toBe(1);
    expect(scorecard.scored).toBe(3);
  });
});
