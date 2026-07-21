/**
 * Tests for capacity.ts - pure capacity computation logic
 */
import {
  parseTargetLength,
  classifyBlockCategory,
  classifyBlockCategoryWithCatchAll,
  findCatchAllCategory,
  resolveSelectionCap,
  computeCapacity,
  CapacityQuota,
  CapacityBlock,
} from '@/lib/capacity';

describe('parseTargetLength', () => {
  it('parses hours', () => {
    expect(parseTargetLength('2h')).toBe(120);
    expect(parseTargetLength('1.5h')).toBe(90);
  });

  it('parses minutes', () => {
    expect(parseTargetLength('45min')).toBe(45);
    expect(parseTargetLength('30m')).toBe(30);
  });

  it('parses combined hours and minutes', () => {
    expect(parseTargetLength('1h 30min')).toBe(90);
  });

  it('treats a bare number as minutes', () => {
    expect(parseTargetLength('90')).toBe(90);
  });

  it('returns 0 for empty/undefined', () => {
    expect(parseTargetLength('')).toBe(0);
    expect(parseTargetLength(undefined)).toBe(0);
  });
});

describe('classifyBlockCategory', () => {
  const quotas: CapacityQuota[] = [
    { category: 'Writing/Deep Work', targetLength: '2h', types: ['writing', 'focus'] },
    { category: 'Batch', targetLength: '1h', types: ['batch'] },
    { category: 'Blogs', targetLength: '1.5h', types: [] },
  ];

  it('matches by mapped type (case-insensitive)', () => {
    expect(classifyBlockCategory(['Writing'], quotas)).toBe('Writing/Deep Work');
    expect(classifyBlockCategory(['batch'], quotas)).toBe('Batch');
  });

  it('matches by category name directly', () => {
    expect(classifyBlockCategory(['Blogs'], quotas)).toBe('Blogs');
  });

  it('returns null when no signal matches', () => {
    expect(classifyBlockCategory(['unknown'], quotas)).toBeNull();
    expect(classifyBlockCategory([], quotas)).toBeNull();
  });

  it('returns the first matching category in quota order', () => {
    // 'focus' only maps to Writing/Deep Work
    expect(classifyBlockCategory(['focus'], quotas)).toBe('Writing/Deep Work');
  });

  it('ignores insignificant whitespace differences (spaces around slash, runs)', () => {
    // Asana Type "Writing / Deep Work" (spaces around slash) must match the
    // config category "Writing/Deep Work".
    expect(classifyBlockCategory(['Writing / Deep Work'], quotas)).toBe('Writing/Deep Work');
    expect(classifyBlockCategory(['Writing  /  Deep   Work'], quotas)).toBe('Writing/Deep Work');
    // Case-insensitivity still holds.
    expect(classifyBlockCategory(['writing / deep work'], quotas)).toBe('Writing/Deep Work');
  });

  it('does not create false matches across categories', () => {
    expect(classifyBlockCategory(['Deep Work'], quotas)).toBeNull();
    expect(classifyBlockCategory(['Blog'], quotas)).toBeNull();
  });
});

describe('findCatchAllCategory / classifyBlockCategoryWithCatchAll', () => {
  // Mirrors the user's real config shape: a "General Todos" category with no
  // weeklyCount and an empty types list, alongside typed quota categories.
  const quotas: CapacityQuota[] = [
    { category: 'Writing/Deep Work', weeklyCount: 3, targetLength: '1.5h', types: ['writing'] },
    { category: 'Batch', weeklyCount: 2, targetLength: '30min', types: ['batch'] },
    { category: 'General Todos', targetLength: '30min', types: [] },
  ];

  it('identifies the no-weeklyCount, empty-types category as the catch-all', () => {
    expect(findCatchAllCategory(quotas)).toBe('General Todos');
  });

  it('returns null when no catch-all category exists', () => {
    const noCatchAll: CapacityQuota[] = [
      { category: 'Writing/Deep Work', weeklyCount: 3, targetLength: '1.5h', types: ['writing'] },
      { category: 'Blogs', weeklyCount: 2, targetLength: '1.5h', types: [] }, // has a quota
    ];
    expect(findCatchAllCategory(noCatchAll)).toBeNull();
  });

  it('routes a task that matches no explicit category to the catch-all', () => {
    // A task typed "todo"/"errand" matches none of the mapped types, so the
    // plain classifier drops it — but the catch-all classifier sends it to
    // "General Todos" instead of returning null.
    expect(classifyBlockCategory(['todo'], quotas)).toBeNull();
    expect(classifyBlockCategoryWithCatchAll(['todo'], quotas)).toBe('General Todos');
    expect(classifyBlockCategoryWithCatchAll(['errand'], quotas)).toBe('General Todos');
    expect(classifyBlockCategoryWithCatchAll([], quotas)).toBe('General Todos');
  });

  it('still prefers an explicit category match over the catch-all', () => {
    expect(classifyBlockCategoryWithCatchAll(['writing'], quotas)).toBe('Writing/Deep Work');
    expect(classifyBlockCategoryWithCatchAll(['batch'], quotas)).toBe('Batch');
    // A task explicitly categorised (via override) as General Todos still lands there.
    expect(classifyBlockCategoryWithCatchAll(['General Todos'], quotas)).toBe('General Todos');
  });
});

describe('resolveSelectionCap', () => {
  it('caps a plain quota category at its unmet weekly quota', () => {
    expect(resolveSelectionCap({ weeklyCount: 3, existing: 0 })).toBe(3);
    expect(resolveSelectionCap({ weeklyCount: 3, existing: 1 })).toBe(2);
    expect(resolveSelectionCap({ weeklyCount: 3, existing: 5 })).toBe(0); // floored
  });

  it('lifts the cap (null) for no-quota and grouped categories', () => {
    expect(resolveSelectionCap({ weeklyCount: 0, existing: 0 })).toBeNull(); // no-quota catch-all
    expect(resolveSelectionCap({ weeklyCount: 3, grouped: true, existing: 0 })).toBeNull();
  });

  it('maxSelection caps a grouped category (e.g. Deep Work "up to 3"), overriding "pick any"', () => {
    // The Task 3 scenario: grouped Writing/Deep Work with maxSelection 3 must cap
    // selection at 3 rather than lifting it to null.
    expect(resolveSelectionCap({ weeklyCount: 3, grouped: true, maxSelection: 3, existing: 0 })).toBe(3);
    // Already-scheduled blocks this week are subtracted, floored at 0.
    expect(resolveSelectionCap({ weeklyCount: 3, grouped: true, maxSelection: 3, existing: 2 })).toBe(1);
    expect(resolveSelectionCap({ weeklyCount: 3, grouped: true, maxSelection: 3, existing: 5 })).toBe(0);
  });

  it('maxSelection also caps a no-quota category', () => {
    expect(resolveSelectionCap({ weeklyCount: 0, maxSelection: 2, existing: 0 })).toBe(2);
  });
});

describe('computeCapacity', () => {
  const quotas: CapacityQuota[] = [
    { category: 'Writing/Deep Work', weeklyCount: 3, targetLength: '2h', types: ['writing'] },
    { category: 'Batch', weeklyCount: 2, targetLength: '1h', types: ['batch'] },
  ];

  it('counts scheduled and completed blocks per category', () => {
    const blocks: CapacityBlock[] = [
      { typeSignals: ['writing'], minutes: 120, completed: true },
      { typeSignals: ['writing'], minutes: 60, completed: false },
      { typeSignals: ['batch'], minutes: 45, completed: false },
      { typeSignals: ['unmapped'], minutes: 30, completed: false }, // ignored
    ];

    const rows = computeCapacity(quotas, blocks);
    const writing = rows.find(r => r.category === 'Writing/Deep Work')!;
    const batch = rows.find(r => r.category === 'Batch')!;

    expect(writing.scheduledCount).toBe(2);
    expect(writing.completedCount).toBe(1);
    expect(writing.scheduledMinutes).toBe(180);
    expect(writing.targetMinutes).toBe(120 * 3);
    expect(writing.weeklyCount).toBe(3);

    expect(batch.scheduledCount).toBe(1);
    expect(batch.completedCount).toBe(0);
    expect(batch.scheduledMinutes).toBe(45);
    expect(batch.targetMinutes).toBe(60 * 2);
  });

  it('returns one row per quota, in quota order, with zeros when no blocks', () => {
    const rows = computeCapacity(quotas, []);
    expect(rows.map(r => r.category)).toEqual(['Writing/Deep Work', 'Batch']);
    expect(rows.every(r => r.scheduledCount === 0 && r.scheduledMinutes === 0)).toBe(true);
  });
});
