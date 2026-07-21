import { partitionDeferrals } from '@/lib/scheduling/deferrals';

describe('partitionDeferrals', () => {
  const weekEnd = '2026-07-19'; // Sunday of the current week

  it('marks a deferral active when its resume date is after this week', () => {
    const { active, expired } = partitionDeferrals({ gid1: '2026-07-20' }, weekEnd);
    expect(active.has('gid1')).toBe(true);
    expect(expired).toEqual([]);
  });

  it('expires a deferral whose resume date falls within this week', () => {
    const { active, expired } = partitionDeferrals({ gid1: '2026-07-15' }, weekEnd);
    expect(active.size).toBe(0);
    expect(expired).toEqual(['gid1']);
  });

  it('expires a deferral whose resume date equals the week end', () => {
    const { active, expired } = partitionDeferrals({ gid1: weekEnd }, weekEnd);
    expect(active.size).toBe(0);
    expect(expired).toEqual(['gid1']);
  });

  it('partitions a mixed set', () => {
    const { active, expired } = partitionDeferrals(
      { a: '2026-07-27', b: '2026-07-10', c: '2026-07-20' },
      weekEnd
    );
    expect(active).toEqual(new Set(['a', 'c']));
    expect(expired).toEqual(['b']);
  });

  it('handles an empty map', () => {
    const { active, expired } = partitionDeferrals({}, weekEnd);
    expect(active.size).toBe(0);
    expect(expired).toEqual([]);
  });
});
