/**
 * Precedence + diffing for AI-runnable verdicts: Dave's own verdict beats the
 * classifier, and only genuinely NEW claims are put in front of him.
 */
import { resolveAiSuitability, selectNewAiClaims, type AiClaimCandidate } from '@/lib/ai-verdicts';

const candidate = (over: Partial<AiClaimCandidate> & { gid: string }): AiClaimCandidate => ({
  integrationId: 'ai1',
  title: `Task ${over.gid}`,
  alreadyAccepted: false,
  ...over,
});

describe('resolveAiSuitability', () => {
  it('lets the user verdict beat the AI answer in both directions', () => {
    expect(
      resolveAiSuitability({ userVerdict: { aiSuitable: false, decidedAt: 'x' }, aiSuitable: true })
    ).toBe(false);
    expect(
      resolveAiSuitability({ userVerdict: { aiSuitable: true, decidedAt: 'x' }, aiSuitable: false })
    ).toBe(true);
  });

  it('falls back to the AI answer, then to no opinion', () => {
    expect(resolveAiSuitability({ aiSuitable: true })).toBe(true);
    expect(resolveAiSuitability({ aiSuitable: false })).toBe(false);
    expect(resolveAiSuitability({})).toBeUndefined();
  });
});

describe('selectNewAiClaims', () => {
  it('returns only newly-claimed tasks, carrying their display fields', () => {
    const claims = selectNewAiClaims([
      candidate({
        gid: 'g-new',
        aiSuitable: true,
        title: 'Draft the summary',
        integrationName: 'OM',
        dueOn: '2026-07-24',
        reason: 'Self-contained writing task',
      }),
      candidate({ gid: 'g-no', aiSuitable: false }),
      candidate({ gid: 'g-unassessed' }),
    ]);

    expect(claims).toEqual([
      {
        gid: 'g-new',
        integrationId: 'ai1',
        title: 'Draft the summary',
        integrationName: 'OM',
        dueOn: '2026-07-24',
        reason: 'Self-contained writing task',
      },
    ]);
  });

  it('excludes tasks already accepted into the AI-runnable list', () => {
    const claims = selectNewAiClaims([
      candidate({ gid: 'g-known', aiSuitable: true, alreadyAccepted: true }),
      candidate({ gid: 'g-new', aiSuitable: true }),
    ]);
    expect(claims.map(c => c.gid)).toEqual(['g-new']);
  });

  it('excludes tasks the user has already ruled on, however the AI votes', () => {
    const claims = selectNewAiClaims([
      candidate({
        gid: 'g-rejected',
        aiSuitable: true,
        userVerdict: { aiSuitable: false, decidedAt: '2026-07-20T10:00:00.000Z' },
      }),
      candidate({
        gid: 'g-approved',
        aiSuitable: true,
        userVerdict: { aiSuitable: true, decidedAt: '2026-07-20T10:00:00.000Z' },
      }),
      candidate({ gid: 'g-new', aiSuitable: true }),
    ]);
    expect(claims.map(c => c.gid)).toEqual(['g-new']);
  });

  it('preserves the caller order and returns [] when nothing is new', () => {
    expect(selectNewAiClaims([])).toEqual([]);
    expect(
      selectNewAiClaims([candidate({ gid: 'g1', aiSuitable: true, alreadyAccepted: true })])
    ).toEqual([]);
    expect(
      selectNewAiClaims([
        candidate({ gid: 'b', aiSuitable: true }),
        candidate({ gid: 'a', aiSuitable: true }),
      ]).map(c => c.gid)
    ).toEqual(['b', 'a']);
  });
});
