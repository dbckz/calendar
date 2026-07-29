import { filterNonTaskReviewBlocks } from '@/lib/scheduling/review-task-filter';
import {
  classifyReviewTitles,
  reviewTitleContentHash,
  REVIEW_TASK_PROMPT_VERSION,
} from '@/lib/review-task-classifier';
import { mergeReviewTitleVerdicts } from '@/lib/user-data-storage';
import type { ReplanReviewBlock } from '@/lib/scheduling/replan';
import type { ReviewTitleVerdict } from '@/lib/storage/core';

jest.mock('@/lib/review-task-classifier', () => {
  const actual = jest.requireActual('@/lib/review-task-classifier');
  return { ...actual, classifyReviewTitles: jest.fn() };
});
jest.mock('@/lib/user-data-storage', () => ({ mergeReviewTitleVerdicts: jest.fn() }));

const mockClassify = classifyReviewTitles as jest.MockedFunction<typeof classifyReviewTitles>;
const mockMerge = mergeReviewTitleVerdicts as jest.MockedFunction<typeof mergeReviewTitleVerdicts>;

function calendarBlock(id: string, title: string): ReplanReviewBlock {
  return {
    googleEventId: id,
    kind: 'task',
    source: 'calendar',
    category: 'Calendar',
    date: '2026-07-28',
    start: '19:30',
    durationMinutes: 30,
    startMs: 0,
    endMs: 0,
    done: false,
    titles: [title],
    tasks: [{ title, done: false }],
  };
}

const appBlock: ReplanReviewBlock = {
  ...calendarBlock('app', 'Write the strategy'),
  source: undefined,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockMerge.mockResolvedValue(undefined);
});

describe('filterNonTaskReviewBlocks', () => {
  it('drops a calendar block the classifier says is not a task, and caches the verdict', async () => {
    mockClassify.mockResolvedValue([{ key: 'sophie', isTask: false, reason: 'A person, not work' }]);

    const out = await filterNonTaskReviewBlocks({
      blocks: [calendarBlock('e1', 'Sophie'), appBlock],
      verdicts: {},
    });

    expect(out.map(b => b.googleEventId)).toEqual(['app']);
    expect(mockMerge).toHaveBeenCalledWith({
      sophie: expect.objectContaining({ isTask: false, decidedBy: 'ai' }),
    });
  });

  it('reuses a cached AI verdict rather than classifying again', async () => {
    const cached: Record<string, ReviewTitleVerdict> = {
      sophie: {
        isTask: false,
        decidedBy: 'ai',
        contentHash: reviewTitleContentHash({
          key: 'sophie',
          title: 'Sophie',
          durationMinutes: 30,
          isRecurring: false,
        }),
        promptVersion: REVIEW_TASK_PROMPT_VERSION,
        updatedAt: '2026-07-28T00:00:00.000Z',
      },
    };

    const out = await filterNonTaskReviewBlocks({
      blocks: [calendarBlock('e1', 'Sophie')],
      verdicts: cached,
    });

    expect(out).toEqual([]);
    expect(mockClassify).not.toHaveBeenCalled();
  });

  it("never re-litigates the user's own verdict", async () => {
    const out = await filterNonTaskReviewBlocks({
      blocks: [calendarBlock('e1', 'Sophie')],
      verdicts: {
        sophie: { isTask: false, decidedBy: 'user', updatedAt: '2026-07-28T00:00:00.000Z' },
      },
    });

    expect(out).toEqual([]);
    expect(mockClassify).not.toHaveBeenCalled();
  });

  it("feeds Dave's own verdicts back to the classifier as few-shot examples", async () => {
    mockClassify.mockResolvedValue([{ key: 'draft memo', isTask: true, reason: 'work' }]);

    await filterNonTaskReviewBlocks({
      blocks: [calendarBlock('e1', 'Draft memo')],
      verdicts: {
        // A user confirmation and a user dismissal — both classes present.
        'meet corinna': { isTask: true, decidedBy: 'user', updatedAt: '2026-07-28T00:00:00.000Z' },
        sophie: { isTask: false, decidedBy: 'user', updatedAt: '2026-07-27T00:00:00.000Z' },
        // An AI verdict must NEVER be fed back as an example.
        'some ai call': { isTask: false, decidedBy: 'ai', updatedAt: '2026-07-26T00:00:00.000Z' },
      },
    });

    expect(mockClassify).toHaveBeenCalledTimes(1);
    const examples = mockClassify.mock.calls[0][2] as string;
    expect(examples).toContain('"meet corinna" → IS a task');
    expect(examples).toContain('"sophie" → NOT a task');
    expect(examples).not.toContain('some ai call');
  });

  it('passes no examples when Dave has no verdicts yet', async () => {
    mockClassify.mockResolvedValue([{ key: 'draft memo', isTask: true, reason: 'work' }]);
    await filterNonTaskReviewBlocks({ blocks: [calendarBlock('e1', 'Draft memo')], verdicts: {} });
    expect(mockClassify.mock.calls[0][2]).toBe('');
  });

  it('fails open: a classifier error keeps every block in the review', async () => {
    mockClassify.mockRejectedValue(new Error('claude unavailable'));

    const out = await filterNonTaskReviewBlocks({
      blocks: [calendarBlock('e1', 'Sophie'), calendarBlock('e2', 'Draft memo')],
      verdicts: {},
    });

    expect(out.map(b => b.googleEventId)).toEqual(['e1', 'e2']);
    expect(mockMerge).not.toHaveBeenCalled();
  });

  it('keeps a title the model omitted, and never calls the classifier with nothing to do', async () => {
    mockClassify.mockResolvedValue([]);

    const out = await filterNonTaskReviewBlocks({
      blocks: [calendarBlock('e1', 'Draft memo')],
      verdicts: {},
    });
    expect(out.map(b => b.googleEventId)).toEqual(['e1']);

    mockClassify.mockClear();
    await filterNonTaskReviewBlocks({ blocks: [appBlock], verdicts: {} });
    expect(mockClassify).not.toHaveBeenCalled();
  });
});
