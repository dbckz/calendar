/**
 * @jest-environment node
 *
 * The review gate on manual AI-runnable assessment:
 *   * 'review' mode holds new claims back instead of writing them to metadata,
 *   * confirming accepts only the ticked ones,
 *   * rejecting writes a user verdict that suppresses future claims,
 *   * cancelling (never calling the verdicts route) writes nothing,
 *   * 'apply' mode — any non-interactive caller — is unchanged.
 * The classifier and storage are mocked so no LLM call is made.
 */
jest.mock('@/lib/ai-classifier', () => ({
  ...jest.requireActual('@/lib/ai-classifier'),
  classifyTasks: jest.fn(),
}));

jest.mock('@/lib/user-data-storage', () => ({
  getAllAiClassification: jest.fn(),
  saveAiClassification: jest.fn(),
  getAiUserVerdicts: jest.fn(),
  setAiUserVerdicts: jest.fn(),
  getAllTaskMetadata: jest.fn(),
  upsertTaskMetadata: jest.fn(),
}));

import { POST as classify } from '@/app/api/tasks/classify-ai/route';
import { POST as applyVerdicts } from '@/app/api/tasks/ai-verdicts/route';
import { classifyTasks } from '@/lib/ai-classifier';
import {
  getAllAiClassification,
  saveAiClassification,
  getAiUserVerdicts,
  setAiUserVerdicts,
  getAllTaskMetadata,
  upsertTaskMetadata,
} from '@/lib/user-data-storage';

const TASKS = [
  { gid: 'g-new', integrationId: 'ai1', title: 'Draft the summary', integrationName: 'OM', dueOn: '2026-07-24' },
  { gid: 'g-known', integrationId: 'ai1', title: 'Already runnable' },
  { gid: 'g-no', integrationId: 'ai1', title: 'Needs a human' },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function post(handler: (r: any) => Promise<Response>, body: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await handler({ json: async () => body } as any);
  return res.json();
}

beforeEach(() => {
  jest.clearAllMocks();
  (getAllAiClassification as jest.Mock).mockResolvedValue({});
  (getAiUserVerdicts as jest.Mock).mockResolvedValue({});
  (getAllTaskMetadata as jest.Mock).mockResolvedValue({
    'g-known': { asanaTaskGid: 'g-known', integrationId: 'ai1', aiDelegable: true, updatedAt: '' },
  });
  (classifyTasks as jest.Mock).mockResolvedValue([
    { gid: 'g-new', aiSuitable: true, reason: 'Self-contained' },
    { gid: 'g-known', aiSuitable: true, reason: 'Still fine' },
    { gid: 'g-no', aiSuitable: false, reason: 'Needs judgement' },
  ]);
});

describe('classify-ai — review mode', () => {
  it('returns only the NEW claim and does not put it in the list yet', async () => {
    const out = await post(classify, { tasks: TASKS, mode: 'review' });

    expect(out.claims).toEqual([
      expect.objectContaining({
        gid: 'g-new',
        title: 'Draft the summary',
        integrationName: 'OM',
        dueOn: '2026-07-24',
        reason: 'Self-contained',
      }),
    ]);
    // The new claim is held back...
    const mirrored = (upsertTaskMetadata as jest.Mock).mock.calls.map(c => [c[0], c[2]]);
    expect(mirrored).not.toContainEqual(['g-new', { aiDelegable: true }]);
    // ...while the negative verdict still applies, as it always has.
    expect(mirrored).toContainEqual(['g-no', { aiDelegable: false }]);
    // The verdict is still cached, so confirming later costs no second LLM call.
    expect((saveAiClassification as jest.Mock).mock.calls[0][0]['g-new']).toMatchObject({
      aiSuitable: true,
    });
  });

  it('reports an empty claim list when nothing is newly claimed', async () => {
    (classifyTasks as jest.Mock).mockResolvedValue([
      { gid: 'g-new', aiSuitable: false, reason: 'No' },
      { gid: 'g-known', aiSuitable: true, reason: 'Still fine' },
      { gid: 'g-no', aiSuitable: false, reason: 'No' },
    ]);
    const out = await post(classify, { tasks: TASKS, mode: 'review' });
    expect(out.claims).toEqual([]);
  });

  it('never re-claims a task the user has ruled out, and spends no LLM call on it', async () => {
    (getAiUserVerdicts as jest.Mock).mockResolvedValue({
      'g-new': { aiSuitable: false, decidedAt: '2026-07-20T10:00:00.000Z' },
    });

    const out = await post(classify, { tasks: TASKS, mode: 'review' });

    expect(out.claims).toEqual([]);
    expect((classifyTasks as jest.Mock).mock.calls[0][0].map((t: { gid: string }) => t.gid)).not.toContain(
      'g-new'
    );
  });

  it('apply mode (any non-interactive caller) is unchanged: claims land immediately', async () => {
    const out = await post(classify, { tasks: TASKS });

    const mirrored = (upsertTaskMetadata as jest.Mock).mock.calls.map(c => [c[0], c[2]]);
    expect(mirrored).toContainEqual(['g-new', { aiDelegable: true }]);
    expect(mirrored).toContainEqual(['g-no', { aiDelegable: false }]);
    expect(out.assessed).toBe(3);
  });

  it('apply mode also respects a standing user rejection', async () => {
    (getAiUserVerdicts as jest.Mock).mockResolvedValue({
      'g-new': { aiSuitable: false, decidedAt: '2026-07-20T10:00:00.000Z' },
    });

    await post(classify, { tasks: TASKS });

    const mirrored = (upsertTaskMetadata as jest.Mock).mock.calls.map(c => [c[0], c[2]]);
    expect(mirrored).not.toContainEqual(['g-new', { aiDelegable: true }]);
  });
});

describe('ai-verdicts — applying the review', () => {
  it('records BOTH classes as user verdicts: the ticked as positive, the unticked as rejections', async () => {
    const out = await post(applyVerdicts, {
      accept: [{ gid: 'g-yes', integrationId: 'ai1' }],
      reject: [{ gid: 'g-nope', integrationId: 'ai1' }],
    });

    expect(upsertTaskMetadata).toHaveBeenCalledWith('g-yes', 'ai1', { aiDelegable: true });
    expect(upsertTaskMetadata).toHaveBeenCalledWith('g-nope', 'ai1', { aiDelegable: false });
    // Confirmations are recorded too (so the classifier can learn his positives),
    // alongside the rejection — both classes, in one write.
    expect(setAiUserVerdicts).toHaveBeenCalledWith([
      { gid: 'g-yes', aiSuitable: true },
      { gid: 'g-nope', aiSuitable: false },
    ]);
    expect(out).toEqual({ accepted: 1, rejected: 1 });
  });

  it('accepting everything records positive verdicts but no rejections', async () => {
    await post(applyVerdicts, { accept: [{ gid: 'g-yes', integrationId: 'ai1' }], reject: [] });
    expect(setAiUserVerdicts).toHaveBeenCalledWith([{ gid: 'g-yes', aiSuitable: true }]);
  });

  it('an empty decision set is rejected (cancel never calls this route at all)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await applyVerdicts({ json: async () => ({}) } as any);
    expect(res.status).toBe(400);
    expect(upsertTaskMetadata).not.toHaveBeenCalled();
    expect(setAiUserVerdicts).not.toHaveBeenCalled();
  });
});
