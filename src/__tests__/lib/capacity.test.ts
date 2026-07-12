/**
 * Tests for capacity.ts - pure capacity computation logic
 */
import {
  parseTargetLength,
  classifyBlockCategory,
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
