/**
 * @jest-environment node
 *
 * Goal inference: the model is mocked, so these cover the parts that must be
 * right whatever it returns — the current-state summary, and hard validation of
 * the proposal (real section, current-period key, evidence rules, in-period and
 * monotone milestones). A proposal the editor can't represent must come back as
 * null, not half-formed.
 */
import {
  inferGoal,
  summariseCurrentState,
  validateInference,
  type InferenceContext,
} from '@/lib/goal-inference';
import type { AsanaProject } from '@/types';
import type { ExerciseSession } from '@/types/life';

const NOW = new Date('2026-08-07T12:00:00');

function session(date: string, distanceKm?: number, type = 'run'): ExerciseSession {
  return {
    id: date,
    date,
    type,
    completed: true,
    planned: false,
    ...(distanceKm ? { distanceKm } : {}),
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`,
  };
}

const PROJECTS: AsanaProject[] = [
  { gid: '111', name: 'Policy programme', integrationId: 'int-a', integrationName: 'Work' },
];

function ctx(overrides: Partial<InferenceContext> = {}): InferenceContext {
  return {
    now: NOW,
    sessions: [session('2026-07-20', 4), session('2026-07-27', 5), session('2026-08-03', 6)],
    projects: PROJECTS,
    ...overrides,
  };
}

describe('summariseCurrentState', () => {
  it('reports training volume and the recent and longest runs', () => {
    const summary = summariseCurrentState(ctx().sessions, NOW);
    expect(summary).toMatch(/sessions/);
    expect(summary).toMatch(/longest ever 6km/);
  });

  it('says so when there is no history', () => {
    expect(summariseCurrentState([], NOW)).toMatch(/No exercise history/);
  });
});

describe('validateInference', () => {
  const base = {
    sectionId: 'exercise',
    periodKind: 'quarter',
    periodKey: '2026-Q3',
    title: 'Run 10K',
    target: { value: 10, unit: 'km' },
    evidence: { kind: 'exercise', unit: 'max-distance-km' },
    milestones: [
      { key: '2026-08-31', value: 7, label: '7 km', reasoning: 'from 6km now' },
      { key: '2026-09-20', value: 9, label: '9 km' },
    ],
  };

  it('accepts a well-formed proposal and keeps its milestones', () => {
    const result = validateInference(base, ctx())!;
    expect(result.title).toBe('Run 10K');
    expect(result.periodKind).toBe('quarter');
    expect(result.evidence).toEqual({ kind: 'exercise', unit: 'max-distance-km' });
    expect(result.milestones.map(m => m.value)).toEqual([7, 9]);
  });

  it('rejects an unknown section outright', () => {
    expect(validateInference({ ...base, sectionId: 'gardening' }, ctx())).toBeNull();
  });

  it('lets the requested section override the model', () => {
    const result = validateInference({ ...base, sectionId: 'work' }, ctx({ requestedSectionId: 'exercise' }))!;
    expect(result.sectionId).toBe('exercise');
  });

  it('coerces the period key to the current one for its kind', () => {
    const result = validateInference({ ...base, periodKey: '2026-Q1' }, ctx())!;
    expect(result.periodKey).toBe('2026-Q3');
  });

  it('drops an asana-project ref that is not in the catalogue, back to manual', () => {
    const result = validateInference(
      { ...base, evidence: { kind: 'asana-project', ref: '999' } },
      ctx()
    )!;
    expect(result.evidence.kind).toBe('manual');
  });

  it('keeps a valid asana-project ref and stamps its integration', () => {
    const result = validateInference(
      { ...base, evidence: { kind: 'asana-project', ref: '111' } },
      ctx()
    )!;
    expect(result.evidence).toEqual({ kind: 'asana-project', ref: '111', integrationId: 'int-a' });
  });

  it('drops milestones outside the period and any that break the ramp', () => {
    const result = validateInference(
      {
        ...base,
        milestones: [
          { key: '2026-08-15', value: 8, label: '8 km' },
          { key: '2026-08-31', value: 6, label: 'backwards' },
          { key: '2026-12-01', value: 12, label: 'in Q4' },
        ],
      },
      ctx()
    )!;
    // 08-31 drops (6 < 8, against the upward ramp); 12-01 drops (in Q4).
    expect(result.milestones.map(m => m.key)).toEqual(['2026-08-15']);
  });

  it('returns null without a title', () => {
    expect(validateInference({ ...base, title: '' }, ctx())).toBeNull();
  });
});

describe('inferGoal', () => {
  it('parses, validates and returns a proposal from the model', async () => {
    const run = jest.fn().mockResolvedValue(
      JSON.stringify({
        sectionId: 'exercise',
        periodKind: 'quarter',
        periodKey: '2026-Q3',
        title: 'Run 10K',
        target: { value: 10, unit: 'km' },
        evidence: { kind: 'exercise', unit: 'max-distance-km' },
        milestones: [{ key: '2026-08-31', value: 7, label: '7 km' }],
      })
    );
    const proposal = await inferGoal('Run 10K by end of quarter', ctx({ run }));
    expect(proposal?.title).toBe('Run 10K');
    expect(proposal?.milestones).toHaveLength(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('returns null when the model returns unparseable text', async () => {
    const run = jest.fn().mockResolvedValue('sorry, I cannot help with that');
    expect(await inferGoal('Run 10K', ctx({ run }))).toBeNull();
  });

  it('returns null when the model call throws', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const run = jest.fn().mockRejectedValue(new Error('claude not found'));
    expect(await inferGoal('Run 10K', ctx({ run }))).toBeNull();
    (console.error as jest.Mock).mockRestore();
  });

  it('returns null for empty text without calling the model', async () => {
    const run = jest.fn();
    expect(await inferGoal('   ', ctx({ run }))).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });
});
