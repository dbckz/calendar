/**
 * Tests for the priority matcher's output mapping (headless Claude call mocked).
 * Verifies conservative behavior: only gids that exist in the candidate set are
 * returned, and every input priority gets exactly one result row.
 */
import { matchPriorities, type PriorityCandidate } from '@/lib/priority-matcher';
import { runClaudeJsonArray } from '@/lib/ai-classifier';

jest.mock('@/lib/ai-classifier', () => ({
  runClaudeJsonArray: jest.fn(),
}));

const mockRun = runClaudeJsonArray as jest.MockedFunction<typeof runClaudeJsonArray>;

const TASKS: PriorityCandidate[] = [
  { gid: '11', title: 'Finish grant report', dueOn: '2026-07-25' },
  { gid: '22', title: 'Draft blog post' },
];

describe('matchPriorities', () => {
  beforeEach(() => mockRun.mockReset());

  it('returns an empty array without calling the model for no priorities', async () => {
    const result = await matchPriorities([], TASKS);
    expect(result).toEqual([]);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('maps matched gids and preserves index alignment', async () => {
    mockRun.mockResolvedValue([
      { index: 0, gid: '11' },
      { index: 1, gid: null },
    ]);
    const result = await matchPriorities(['finish grant report', 'new idea'], TASKS);
    expect(result).toEqual([
      { index: 0, gid: '11' },
      { index: 1, gid: null },
    ]);
  });

  it('nulls out gids that are not in the candidate set (hallucination guard)', async () => {
    mockRun.mockResolvedValue([{ index: 0, gid: '999' }]);
    const result = await matchPriorities(['something'], TASKS);
    expect(result).toEqual([{ index: 0, gid: null }]);
  });

  it('fills missing indices with null so every priority has a row', async () => {
    mockRun.mockResolvedValue([{ index: 1, gid: '22' }]);
    const result = await matchPriorities(['a', 'b', 'c'], TASKS);
    expect(result).toEqual([
      { index: 0, gid: null },
      { index: 1, gid: '22' },
      { index: 2, gid: null },
    ]);
  });

  it('coerces string indices from the model', async () => {
    mockRun.mockResolvedValue([{ index: '0', gid: '11' }]);
    const result = await matchPriorities(['finish grant report'], TASKS);
    expect(result).toEqual([{ index: 0, gid: '11' }]);
  });
});
