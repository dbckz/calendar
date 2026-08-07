/**
 * @jest-environment node
 *
 * The progression plan: parsing milestone keys, cleaning a raw plan (in-period,
 * monotone toward the target), and reading an expected value off the ramp —
 * including the before-first and after-last cases that make the curve
 * well-defined at the period's edges.
 */
import {
  expectedFromPlan,
  isMilestoneInPeriod,
  isValidMilestoneKey,
  milestoneDate,
  nextMilestone,
  sanitizeMilestones,
} from '@/lib/goal-plan';
import type { Goal } from '@/types/life';

function runGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    sectionId: 'exercise',
    periodKind: 'quarter',
    periodKey: '2026-Q3',
    title: 'Run 10K',
    target: { value: 10, unit: 'km' },
    evidence: { kind: 'exercise', unit: 'max-distance-km' },
    plan: [
      { key: '2026-07-31', value: 5, label: '5 km' },
      { key: '2026-08-31', value: 7, label: '7 km' },
      { key: '2026-09-15', value: 9, label: '9 km' },
    ],
    planSource: 'ai',
    checkIns: [],
    status: 'active',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('milestoneDate / keys', () => {
  it('parses a plain date key', () => {
    expect(milestoneDate('2026-09-15')?.getFullYear()).toBe(2026);
    expect(isValidMilestoneKey('2026-09-15')).toBe(true);
  });

  it('resolves an ISO week key to its Monday', () => {
    // ISO week 37 of 2026 begins Monday 7 September.
    const monday = milestoneDate('2026-W37');
    expect(monday).not.toBeNull();
    expect(monday!.getDay()).toBe(1);
  });

  it('rejects a malformed key', () => {
    expect(milestoneDate('next week')).toBeNull();
    expect(isValidMilestoneKey('2026-13-40')).toBe(false);
  });

  it('knows whether a key falls inside a period', () => {
    expect(isMilestoneInPeriod('2026-08-31', 'quarter', '2026-Q3')).toBe(true);
    // 1 October is Q4, past the exclusive end of Q3.
    expect(isMilestoneInPeriod('2026-10-01', 'quarter', '2026-Q3')).toBe(false);
  });
});

describe('sanitizeMilestones', () => {
  const opts = { periodKind: 'quarter' as const, periodKey: '2026-Q3', target: 10, unit: 'km' };

  it('drops out-of-period and malformed entries, keeps the rest sorted', () => {
    const clean = sanitizeMilestones(
      [
        { key: '2026-09-15', value: 9, label: '9 km' },
        { key: 'garbage', value: 4, label: 'bad key' },
        { key: '2026-10-05', value: 11, label: 'in Q4' },
        { key: '2026-07-31', value: 5, label: '5 km' },
      ],
      opts
    );
    expect(clean.map(m => m.key)).toEqual(['2026-07-31', '2026-09-15']);
  });

  it('drops milestones that break the ramp toward the target', () => {
    const clean = sanitizeMilestones(
      [
        { key: '2026-07-31', value: 5, label: '5 km' },
        { key: '2026-08-15', value: 4, label: 'backwards' },
        { key: '2026-08-31', value: 7, label: '7 km' },
      ],
      opts
    );
    expect(clean.map(m => m.value)).toEqual([5, 7]);
  });

  it('synthesises a label from the value when one is missing', () => {
    const clean = sanitizeMilestones([{ key: '2026-08-31', value: 7 }], opts);
    expect(clean[0].label).toBe('7 km');
  });

  it('supports a descending ramp when the target is below the first value', () => {
    const clean = sanitizeMilestones(
      [
        { key: '2026-07-31', value: 90, label: '90kg' },
        { key: '2026-08-31', value: 85, label: '85kg' },
        { key: '2026-09-15', value: 95, label: 'wrong way' },
      ],
      { periodKind: 'quarter', periodKey: '2026-Q3', target: 80 }
    );
    expect(clean.map(m => m.value)).toEqual([90, 85]);
  });

  it('returns [] for non-array input', () => {
    expect(sanitizeMilestones(undefined, opts)).toEqual([]);
    expect(sanitizeMilestones('nope', opts)).toEqual([]);
  });
});

describe('expectedFromPlan', () => {
  it('interpolates between two milestones', () => {
    // Halfway (in days) between 31 Jul (5km) and 31 Aug (7km) is ~15 Aug → ~6km.
    const at = new Date('2026-08-15T12:00:00');
    const expected = expectedFromPlan(runGoal(), at);
    expect(expected).not.toBeNull();
    expect(expected!).toBeGreaterThan(5.5);
    expect(expected!).toBeLessThan(6.5);
  });

  it('before the first milestone, ramps up from the period start at zero', () => {
    // Q3 starts 1 Jul; first milestone 5km on 31 Jul. Mid-July is roughly half.
    const at = new Date('2026-07-16T00:00:00');
    const expected = expectedFromPlan(runGoal(), at)!;
    expect(expected).toBeGreaterThan(1.5);
    expect(expected).toBeLessThan(4);
  });

  it('after the last milestone, ramps on toward the target by period end', () => {
    // Last milestone 9km on 15 Sep; target 10km at the end of Q3 (30 Sep).
    // Late September should read between 9 and 10.
    const at = new Date('2026-09-25T00:00:00');
    const expected = expectedFromPlan(runGoal(), at)!;
    expect(expected).toBeGreaterThan(9);
    expect(expected).toBeLessThan(10);
  });

  it('falls back to null when there is no plan to pace against', () => {
    expect(expectedFromPlan(runGoal({ plan: [] }), new Date('2026-08-15'))).toBeNull();
    // A plan with no numeric values gives nothing to interpolate.
    const narrative = runGoal({ plan: [{ key: '2026-08-15', label: 'checkpoint' }] });
    expect(expectedFromPlan(narrative, new Date('2026-08-15'))).toBeNull();
  });
});

describe('nextMilestone', () => {
  it('returns the first milestone still ahead of now', () => {
    const next = nextMilestone(runGoal(), new Date('2026-08-10T00:00:00'));
    expect(next?.key).toBe('2026-08-31');
  });

  it('returns null once every milestone is behind', () => {
    expect(nextMilestone(runGoal(), new Date('2026-09-20T00:00:00'))).toBeNull();
  });
});
