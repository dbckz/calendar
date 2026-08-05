/**
 * @jest-environment node
 *
 * The session-target recommender. The notes quoted here are real ones from the
 * training log — reading effort out of them is the whole basis of the
 * recommendation, so they are the cases that matter.
 */
import { buildTarget, readEffort } from '@/lib/exercise-targets';
import type { ExerciseProgression, ProgressionPoint } from '@/lib/exercise-progression';

function progression(latest: ProgressionPoint, name = 'Converging chest press machine'): ExerciseProgression {
  return { name, key: name.toLowerCase(), sessions: 1, points: [latest], first: latest, latest };
}

describe('readEffort', () => {
  it('reads a numeric range of reps in reserve', () => {
    expect(readEffort('Could have done 1-2 more per set at most').rir).toBe(1.5);
    expect(readEffort('Could have done 3-4 more per set').rir).toBe(3.5);
    expect(readEffort('Could have done 2-3 more').rir).toBe(2.5);
  });

  it('reads vaguer phrasings', () => {
    expect(readEffort('About right — couple in tank').rir).toBe(2);
    expect(readEffort('Could have done quite a few more- up the weight').rir).toBe(4);
    expect(readEffort('Easy — add weight').rir).toBe(4);
  });

  it('recognises being at the limit', () => {
    expect(readEffort('At limit, make lighter').rir).toBe(0);
    expect(readEffort('Incredibly hard').rir).toBe(0);
  });

  it('spots a set that was not completed', () => {
    expect(
      readEffort('Struggled. Second set only did 7, third set reduced to 25.2').failed
    ).toBe(true);
    expect(readEffort('Only managed 8 in second and third set').failed).toBe(true);
  });

  it('picks up explicit instructions in either direction', () => {
    expect(readEffort('Could have done quite a few more- up the weight').explicit).toBe('up');
    expect(readEffort('At limit, make lighter').explicit).toBe('down');
    expect(readEffort('Couldnt do any more - switch to 6kg').explicit).toBe('down');
  });

  it('says nothing when the note says nothing about effort', () => {
    expect(readEffort('')).toEqual({});
    expect(readEffort(undefined)).toEqual({});
    // Silence must not be read as "that was easy".
    expect(readEffort('Did it at the new gym').rir).toBeUndefined();
  });
});

describe('buildTarget', () => {
  it('adds weight when there were reps in reserve', () => {
    const target = buildTarget(
      progression({
        date: '2026-08-03',
        weightKg: 32,
        sets: 3,
        reps: 8,
        notes: 'Could have done 3-4 more per set',
      })
    );
    expect(target.action).toBe('increase');
    // 3.5 RIR earns the larger 10% step.
    expect(target.weightKg).toBe(35);
    expect(target.reps).toBe(8);
    expect(target.rationale).toMatch(/reps left in reserve/);
  });

  it('takes a smaller step when there was only a rep or two spare', () => {
    const target = buildTarget(
      progression({ date: '2026-08-03', weightKg: 40, sets: 3, reps: 8, notes: 'About right — couple in tank' })
    );
    expect(target.action).toBe('increase');
    expect(target.weightKg).toBe(42); // 5% of 40, rounded to the half kilo
  });

  it('holds the weight after a session at the limit', () => {
    const target = buildTarget(
      progression({ date: '2026-08-03', weightKg: 45, sets: 3, reps: 8, notes: 'At limit' })
    );
    expect(target.action).toBe('hold');
    expect(target.weightKg).toBe(45);
  });

  it('reduces when the note says it was too heavy', () => {
    // The real case: shoulder press at 25.3kg, "At limit, make lighter".
    const target = buildTarget(
      progression({ date: '2026-07-27', weightKg: 25.3, sets: 3, reps: 8, notes: 'At limit, make lighter' })
    );
    expect(target.action).toBe('reduce');
    expect(target.weightKg).toBe(23);
    expect(target.rationale).toMatch(/too heavy/);
  });

  it('holds rather than reducing when only a rep or two was missed', () => {
    const target = buildTarget(
      progression({
        date: '2026-08-02',
        weightKg: 10,
        sets: 3,
        reps: 10,
        notes: 'Only managed 8 in second and third set',
      })
    );
    // Missing two reps is a completion problem, not a wrong-weight problem —
    // the weight stays and the sets get finished. Only an explicit "too heavy"
    // triggers a cut.
    expect(target.action).toBe('hold');
    expect(target.weightKg).toBe(10);
    expect(target.rationale).toMatch(/complete all 3 sets of 10/);
  });

  it('progresses bodyweight work by reps, not by load', () => {
    const target = buildTarget(
      progression(
        { date: '2026-08-04', sets: 3, reps: 8, notes: 'Felt good, could have done a couple more' },
        'Dead bug'
      )
    );
    expect(target.action).toBe('add-reps');
    expect(target.weightKg).toBeUndefined();
    expect(target.reps).toBe(10);
  });

  it('progresses a timed hold by seconds', () => {
    const target = buildTarget(
      progression(
        { date: '2026-08-04', sets: 3, holdSeconds: 30, notes: 'Felt really good, could have done a couple more' },
        'Side plank'
      )
    );
    expect(target.action).toBe('add-reps');
    expect(target.holdSeconds).toBe(40);
  });

  it('holds when the note gives no reason to move', () => {
    const target = buildTarget(progression({ date: '2026-08-03', weightKg: 15, sets: 3, reps: 12 }));
    expect(target.action).toBe('hold');
    expect(target.weightKg).toBe(15);
  });

  it('reports having no history to go on', () => {
    const empty: ExerciseProgression = { name: 'Hack squat', key: 'hack squat', sessions: 0, points: [] };
    expect(buildTarget(empty).action).toBe('no-history');
  });
});
