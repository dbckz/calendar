/**
 * @jest-environment node
 *
 * Exercise evidence, focused on the peak-metric unit: a "run 10K" goal is judged
 * by the single longest distance in the period, not a tally of sessions.
 */
import { resolveEvidence } from '@/lib/goal-evidence';
import { createSession } from '@/lib/storage/exercise';
import { __resetDbForTests } from '@/lib/storage/db';
import type { Goal } from '@/types/life';

function runGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    sectionId: 'exercise',
    periodKind: 'month',
    periodKey: '2026-08',
    title: 'Run 10K',
    target: { value: 10, unit: 'km' },
    evidence: { kind: 'exercise', unit: 'max-distance-km' },
    checkIns: [],
    status: 'active',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('max-distance-km evidence', () => {
  beforeEach(() => {
    __resetDbForTests();
  });

  it('reports the longest single distance in the period, from the session or its exercises', async () => {
    await createSession({ date: '2026-08-03', type: 'run', distanceKm: 5 });
    await createSession({ date: '2026-08-10', type: 'run', distanceKm: 7 });
    // Distance logged on an exercise inside a gym session counts too.
    await createSession({
      date: '2026-08-18',
      type: 'gym',
      exercises: [{ name: 'Treadmill run', distanceKm: 8.2 }],
    });

    const result = await resolveEvidence(runGoal());
    expect(result.actual).toBe(8.2);
    expect(result.label).toMatch(/Longest 8.2 km/);
  });

  it('ignores sessions outside the period', async () => {
    await createSession({ date: '2026-07-31', type: 'run', distanceKm: 12 });
    await createSession({ date: '2026-08-05', type: 'run', distanceKm: 6 });
    expect((await resolveEvidence(runGoal())).actual).toBe(6);
  });

  it('reports no distance rather than zero when nothing qualifies', async () => {
    await createSession({ date: '2026-08-05', type: 'gym', exercises: [{ name: 'Bench', weightKg: 40 }] });
    const result = await resolveEvidence(runGoal());
    expect(result.actual).toBeNull();
    expect(result.label).toMatch(/No distance/);
  });

  it('restricts to a session type when the ref names one', async () => {
    await createSession({ date: '2026-08-05', type: 'run', distanceKm: 6 });
    await createSession({ date: '2026-08-12', type: 'cycle', distanceKm: 20 });
    const result = await resolveEvidence(
      runGoal({ evidence: { kind: 'exercise', ref: 'run', unit: 'max-distance-km' } })
    );
    expect(result.actual).toBe(6);
  });
});
