/**
 * Tests for the pure parts of the daily-review encouragement helper: completion
 * bucketing, fallback picking, prompt building, and message sanitising. The
 * headless Claude call is mocked for the end-to-end generate path (we test the
 * fallback behaviour, not the spawn).
 */
import {
  completionBucket,
  pickFallback,
  buildEncouragementPrompt,
  sanitizeMessage,
  generateReviewMessage,
  type ReviewOutcome,
} from '@/lib/review-encouragement';
import { runClaudeText } from '@/lib/ai-classifier';

jest.mock('@/lib/ai-classifier', () => ({
  runClaudeText: jest.fn(),
}));

const mockRun = runClaudeText as jest.MockedFunction<typeof runClaudeText>;

const outcome = (doneCount: number, totalCount: number): ReviewOutcome => ({
  doneCount,
  totalCount,
  doneTitles: [],
  notDoneTitles: [],
});

describe('completionBucket', () => {
  it('returns "all" when everything is done', () => {
    expect(completionBucket(outcome(4, 4))).toBe('all');
  });

  it('returns "none" when nothing is done', () => {
    expect(completionBucket(outcome(0, 5))).toBe('none');
  });

  it('returns "most" at or above 60% completion', () => {
    expect(completionBucket(outcome(3, 5))).toBe('most'); // exactly 0.6
    expect(completionBucket(outcome(7, 8))).toBe('most');
  });

  it('returns "some" below 60% completion', () => {
    expect(completionBucket(outcome(2, 5))).toBe('some'); // 0.4
    expect(completionBucket(outcome(1, 4))).toBe('some');
  });

  it('treats an empty review as "none" without dividing by zero', () => {
    expect(completionBucket(outcome(0, 0))).toBe('none');
  });
});

describe('pickFallback', () => {
  it('picks a non-empty message from the matching bucket every time', () => {
    for (const [done, total] of [[4, 4], [3, 5], [1, 4], [0, 3]] as const) {
      for (let i = 0; i < 20; i++) {
        const msg = pickFallback(outcome(done, total));
        expect(typeof msg).toBe('string');
        expect(msg.length).toBeGreaterThan(0);
      }
    }
  });

  it('never mentions guilt-inducing framing on the none bucket', () => {
    // Sample the whole none pool; every message should be reassuring, not blaming.
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) seen.add(pickFallback(outcome(0, 5)));
    for (const msg of seen) {
      expect(msg.toLowerCase()).not.toMatch(/should have|failed|lazy/);
    }
  });
});

describe('buildEncouragementPrompt', () => {
  it('includes the counts and both task lists', () => {
    const prompt = buildEncouragementPrompt({
      doneCount: 2,
      totalCount: 3,
      doneTitles: ['Write brief', 'Reply to Sam'],
      notDoneTitles: ['Deep work on model'],
    });
    expect(prompt).toContain('Completed 2 of 3 planned work blocks');
    expect(prompt).toContain('Write brief; Reply to Sam');
    expect(prompt).toContain('Deep work on model');
  });

  it('steers celebratory for a full day and reassuring for an empty one', () => {
    expect(buildEncouragementPrompt(outcome(3, 3))).toContain('celebratory');
    expect(buildEncouragementPrompt(outcome(0, 3))).toContain('no guilt or pressure');
  });

  it('shows "(none)" when a list is empty', () => {
    const prompt = buildEncouragementPrompt(outcome(0, 2));
    expect(prompt).toContain('Got done: (none)');
  });
});

describe('sanitizeMessage', () => {
  it('trims whitespace and wrapping quotes', () => {
    expect(sanitizeMessage('  "Great work today."  ')).toBe('Great work today.');
  });

  it('strips a code fence wrapper', () => {
    expect(sanitizeMessage('```\nNice one today.\n```')).toBe('Nice one today.');
  });

  it('collapses internal whitespace', () => {
    expect(sanitizeMessage('Good\n\n  day.')).toBe('Good day.');
  });

  it('rejects empty output', () => {
    expect(sanitizeMessage('   ')).toBeNull();
    expect(sanitizeMessage('""')).toBeNull();
  });

  it('rejects implausibly long output', () => {
    expect(sanitizeMessage('x'.repeat(401))).toBeNull();
  });
});

describe('generateReviewMessage', () => {
  beforeEach(() => mockRun.mockReset());

  it('returns the sanitised model output on success', async () => {
    mockRun.mockResolvedValue('  "You smashed it today." ');
    const msg = await generateReviewMessage(outcome(4, 4));
    expect(msg).toBe('You smashed it today.');
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it('falls back to a bucketed canned message when the CLI throws', async () => {
    mockRun.mockRejectedValue(new Error('claude not found'));
    const msg = await generateReviewMessage(outcome(0, 4));
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });

  it('falls back when the model returns garbage', async () => {
    mockRun.mockResolvedValue('   ');
    const msg = await generateReviewMessage(outcome(2, 4));
    expect(msg.length).toBeGreaterThan(0);
  });
});
