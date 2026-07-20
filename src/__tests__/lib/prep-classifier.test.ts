/**
 * Tests for the pure parts of the meeting-prep classifier: key normalization,
 * content hashing, prompt versioning, and output mapping (with the headless
 * Claude call mocked).
 */
import {
  normalizePrepKey,
  prepContentHash,
  classifyPrep,
  PREP_PROMPT_VERSION,
  type PrepMeetingInput,
} from '@/lib/prep-classifier';
import { runClaudeJsonArray } from '@/lib/ai-classifier';

jest.mock('@/lib/ai-classifier', () => ({
  runClaudeJsonArray: jest.fn(),
}));

const mockRun = runClaudeJsonArray as jest.MockedFunction<typeof runClaudeJsonArray>;

function meeting(overrides: Partial<PrepMeetingInput> = {}): PrepMeetingInput {
  return {
    key: normalizePrepKey('Board sync'),
    title: 'Board sync',
    durationMinutes: 60,
    isRecurring: false,
    ...overrides,
  };
}

describe('normalizePrepKey', () => {
  it('lowercases, trims and collapses whitespace', () => {
    expect(normalizePrepKey('  Board   Sync  ')).toBe('board sync');
    expect(normalizePrepKey('Board\tSync\n')).toBe('board sync');
  });

  it('treats differently-cased/spaced titles as the same key', () => {
    expect(normalizePrepKey('1:1 with Alice')).toBe(normalizePrepKey('1:1  With   alice'));
  });
});

describe('prepContentHash', () => {
  it('is stable for identical content', () => {
    expect(prepContentHash(meeting())).toBe(prepContentHash(meeting()));
  });

  it('changes when the recurring flag flips', () => {
    expect(prepContentHash(meeting({ isRecurring: false }))).not.toBe(
      prepContentHash(meeting({ isRecurring: true }))
    );
  });

  it('changes when title or description changes', () => {
    expect(prepContentHash(meeting({ title: 'Board sync' }))).not.toBe(
      prepContentHash(meeting({ title: 'Team sync' }))
    );
    expect(prepContentHash(meeting({ description: 'agenda a' }))).not.toBe(
      prepContentHash(meeting({ description: 'agenda b' }))
    );
  });

  it('ignores duration and attendee count (not part of the fingerprint)', () => {
    expect(prepContentHash(meeting({ durationMinutes: 30 }))).toBe(
      prepContentHash(meeting({ durationMinutes: 90, attendeeCount: 5 }))
    );
  });
});

describe('PREP_PROMPT_VERSION', () => {
  it('is a stable 12-char hex slice', () => {
    expect(PREP_PROMPT_VERSION).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('classifyPrep', () => {
  beforeEach(() => mockRun.mockReset());

  it('returns an empty array without calling the model when there are no meetings', async () => {
    const result = await classifyPrep([]);
    expect(result).toEqual([]);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('maps model records to PrepResult, coercing types and clamping reason', async () => {
    mockRun.mockResolvedValue([
      { key: 'board sync', needsPrep: true, reason: 'external decision meeting' },
      { key: 'daily standup', needsPrep: false, reason: 'x'.repeat(200) },
    ]);
    const result = await classifyPrep([
      meeting({ key: 'board sync', title: 'Board sync' }),
      meeting({ key: 'daily standup', title: 'Daily standup', isRecurring: true }),
    ]);
    expect(result).toEqual([
      { key: 'board sync', needsPrep: true, reason: 'external decision meeting' },
      { key: 'daily standup', needsPrep: false, reason: 'x'.repeat(120) },
    ]);
  });

  it('drops records without a string key and defaults missing needsPrep to false', async () => {
    mockRun.mockResolvedValue([
      { needsPrep: true }, // no key -> dropped
      { key: 'board sync' }, // missing needsPrep -> false
    ]);
    const result = await classifyPrep([meeting({ key: 'board sync' })]);
    expect(result).toEqual([{ key: 'board sync', needsPrep: false, reason: '' }]);
  });
});
