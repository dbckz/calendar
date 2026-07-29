import { buildExamplesBlock, composePrompt, isVerdictReusable, type LabelledVerdict } from '@/lib/classifier-learning';
import { PROMPT_VERSION } from '@/lib/ai-classifier';
import { PREP_PROMPT_VERSION } from '@/lib/prep-classifier';
import { REVIEW_TASK_PROMPT_VERSION } from '@/lib/review-task-classifier';

describe('buildExamplesBlock', () => {
  it('returns an empty string when there are no verdicts', () => {
    expect(buildExamplesBlock([])).toBe('');
    expect(buildExamplesBlock([{ key: '   ', label: 'true' }])).toBe('');
  });

  it('renders one line per example, with a heading and a label renderer', () => {
    const out = buildExamplesBlock(
      [
        { key: 'Meet Corinna', label: 'true', at: 2 },
        { key: 'Sophie', label: 'false', at: 1 },
      ],
      { heading: 'Examples:', render: l => (l === 'true' ? 'IS a task' : 'NOT a task') }
    );
    expect(out).toBe('Examples:\n- "Meet Corinna" → IS a task\n- "Sophie" → NOT a task');
  });

  it('keeps only the most recent N per class', () => {
    const verdicts: LabelledVerdict[] = Array.from({ length: 5 }, (_, i) => ({
      key: `t${i}`,
      label: 'true',
      at: i, // t4 newest
    }));
    const out = buildExamplesBlock(verdicts, { perClass: 2 });
    // Newest two only, newest first.
    expect(out).toBe('- "t4" → true\n- "t3" → true');
  });

  it('balances classes round-robin so one cannot swamp the other under the cap', () => {
    const verdicts: LabelledVerdict[] = [
      ...Array.from({ length: 10 }, (_, i) => ({ key: `p${i}`, label: 'true', at: 100 + i })),
      { key: 'n0', label: 'false', at: 50 },
      { key: 'n1', label: 'false', at: 49 },
    ];
    const out = buildExamplesBlock(verdicts, { maxTotal: 4 });
    const lines = out.split('\n');
    // 4 total, interleaved: two positives and two negatives, not four positives.
    expect(lines).toHaveLength(4);
    expect(lines.filter(l => l.includes('true'))).toHaveLength(2);
    expect(lines.filter(l => l.includes('false'))).toHaveLength(2);
  });

  it('dedupes a re-judged key, keeping the latest verdict only', () => {
    const out = buildExamplesBlock(
      [
        { key: 'Sync with Ana', label: 'false', at: 1 },
        { key: 'Sync with Ana', label: 'true', at: 2 }, // changed his mind
      ],
      { render: l => l }
    );
    expect(out).toBe('- "Sync with Ana" → true');
  });

  it('truncates a long key with an ellipsis', () => {
    const key = 'x'.repeat(100);
    const out = buildExamplesBlock([{ key, label: 'true' }], { keyMaxChars: 10 });
    expect(out).toBe(`- "${'x'.repeat(9)}…" → true`);
  });
});

describe('composePrompt — examples never touch the hashed base', () => {
  const BASE = 'ROLE\nguidance\n\nItems:\n[a] one';

  it('is byte-identical to the base when there are no examples', () => {
    expect(composePrompt(BASE, '')).toBe(BASE);
  });

  it('prepends the examples and leaves the base intact as a suffix', () => {
    const out = composePrompt(BASE, 'EXAMPLES BLOCK');
    expect(out.startsWith('EXAMPLES BLOCK')).toBe(true);
    expect(out.endsWith(BASE)).toBe(true);
  });

  it("leaves every classifier's exported PROMPT_VERSION unchanged whatever the examples", () => {
    // The version hashes the base template only. Examples are a runtime arg to
    // composePrompt and can never reach the hash — so a new verdict can never
    // invalidate the verdict cache. These are module constants; capturing them
    // before and after composing prompts with different examples documents (and
    // guards) that invariant.
    const before = [PROMPT_VERSION, PREP_PROMPT_VERSION, REVIEW_TASK_PROMPT_VERSION];
    composePrompt(BASE, 'examples A');
    composePrompt(BASE, 'examples B — totally different');
    expect([PROMPT_VERSION, PREP_PROMPT_VERSION, REVIEW_TASK_PROMPT_VERSION]).toEqual(before);
    // And each is a stable 12-char hex fingerprint.
    for (const v of before) expect(v).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('isVerdictReusable', () => {
  it('always reuses a user verdict', () => {
    expect(isVerdictReusable({ decidedBy: 'user' }, 'h', 'v')).toBe(true);
  });

  it('reuses an AI verdict only when hash AND prompt version match', () => {
    expect(isVerdictReusable({ decidedBy: 'ai', contentHash: 'h', promptVersion: 'v' }, 'h', 'v')).toBe(true);
    expect(isVerdictReusable({ decidedBy: 'ai', contentHash: 'h', promptVersion: 'v' }, 'h2', 'v')).toBe(false);
    expect(isVerdictReusable({ decidedBy: 'ai', contentHash: 'h', promptVersion: 'v' }, 'h', 'v2')).toBe(false);
  });

  it('never reuses a missing verdict', () => {
    expect(isVerdictReusable(undefined, 'h', 'v')).toBe(false);
  });
});
