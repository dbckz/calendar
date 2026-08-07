/**
 * The rule shared by the AI-runnable panels and the classify-ai route: a
 * delegated task leaves the AI-runnable queue until it is explicitly returned.
 */
import { isExcludedFromAiRunnable, excludedFromAiRunnable } from '@/lib/delegation-exclusion';
import { DelegationQueueEntry } from '@/types';

const entry = (over: Partial<DelegationQueueEntry> & { asanaTaskGid: string }): DelegationQueueEntry => ({
  integrationId: 'int-1',
  title: 'Task',
  brief: '',
  mode: 'background',
  state: 'queued',
  priority: 0,
  enqueuedAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

describe('isExcludedFromAiRunnable', () => {
  it('does not exclude a task with no delegation entry', () => {
    expect(isExcludedFromAiRunnable(undefined)).toBe(false);
  });

  it('excludes a delegated task in any state until it is returned', () => {
    for (const state of ['queued', 'running', 'done', 'failed'] as const) {
      expect(isExcludedFromAiRunnable(entry({ asanaTaskGid: 'g', state }))).toBe(true);
    }
  });

  it('excludes a reviewed run that has not been returned', () => {
    expect(
      isExcludedFromAiRunnable(entry({ asanaTaskGid: 'g', state: 'done', reviewedAt: '2026-08-02T00:00:00.000Z' }))
    ).toBe(true);
  });

  it('stops excluding once the task is explicitly returned to the queue', () => {
    expect(
      isExcludedFromAiRunnable(
        entry({ asanaTaskGid: 'g', state: 'done', reviewedAt: '2026-08-02T00:00:00.000Z', returnedToAiAt: '2026-08-03T00:00:00.000Z' })
      )
    ).toBe(false);
  });
});

describe('excludedFromAiRunnable', () => {
  it('collects the excluded gids and omits returned ones', () => {
    const queue: Record<string, DelegationQueueEntry> = {
      running: entry({ asanaTaskGid: 'running', state: 'running' }),
      reviewed: entry({ asanaTaskGid: 'reviewed', state: 'done', reviewedAt: '2026-08-02T00:00:00.000Z' }),
      returned: entry({ asanaTaskGid: 'returned', state: 'done', returnedToAiAt: '2026-08-03T00:00:00.000Z' }),
    };
    expect(excludedFromAiRunnable(queue)).toEqual(new Set(['running', 'reviewed']));
  });

  it('is empty for an empty queue', () => {
    expect(excludedFromAiRunnable({})).toEqual(new Set());
  });
});
