/**
 * Tests for mergeCarryBlocks: a grouped category places several blocks a week
 * over ONE shared agenda, so the end-of-week review must show one card per
 * grouped category with each task listed exactly once — for every grouped
 * category, with no category name special-cased.
 */
import { mergeCarryBlocks, type ReplanCarryBlock, type ReplanCarryTask } from '@/lib/scheduling/replan';

const task = (id: string, over: Partial<ReplanCarryTask> = {}): ReplanCarryTask => ({
  id,
  title: `Task ${id}`,
  done: false,
  gid: id,
  ...over,
});

const block = (
  googleEventId: string,
  category: string,
  tasks: ReplanCarryTask[],
  over: Partial<ReplanCarryBlock> = {}
): ReplanCarryBlock => ({
  googleEventId,
  category,
  titles: tasks.map(t => t.title),
  date: '2026-07-17',
  start: '08:30',
  durationMinutes: 90,
  reason: 'unplaceable',
  tasks,
  mergedEventIds: [],
  ...over,
});

describe('mergeCarryBlocks', () => {
  it('folds sibling blocks of a grouped category into one card with unique tasks', () => {
    const shared = [task('g1'), task('g2')];
    const cards = mergeCarryBlocks([
      block('evt-0830', 'Writing', shared.map(t => ({ ...t }))),
      block('evt-1200', 'Writing', [...shared.map(t => ({ ...t })), task('g3')], { start: '12:00' }),
    ]);

    expect(cards).toHaveLength(1);
    expect(cards[0].tasks.map(t => t.id)).toEqual(['g1', 'g2', 'g3']);
    // Both underlying blocks stay addressable for override clearing / mark done.
    expect(cards[0].mergedEventIds).toEqual(['evt-0830', 'evt-1200']);
  });

  it('merges every grouped category independently, with no category special-cased', () => {
    const cards = mergeCarryBlocks([
      block('evt-w1', 'Writing', [task('w1'), task('w2')]),
      block('evt-e1', 'Engagement / Outreach', [task('e1'), task('e2')]),
      block('evt-w2', 'Writing', [task('w1'), task('w2'), task('w3')]),
      block('evt-e2', 'Engagement / Outreach', [task('e1'), task('e3')]),
      block('evt-d1', 'Deep Work', [task('d1'), task('d2')]),
      block('evt-d2', 'Deep Work', [task('d1'), task('d2')]),
    ]);

    expect(cards.map(c => c.category)).toEqual(['Writing', 'Engagement / Outreach', 'Deep Work']);
    expect(cards[0].tasks.map(t => t.id)).toEqual(['w1', 'w2', 'w3']);
    expect(cards[1].tasks.map(t => t.id)).toEqual(['e1', 'e2', 'e3']);
    expect(cards[2].tasks.map(t => t.id)).toEqual(['d1', 'd2']);
    expect(cards[1].mergedEventIds).toEqual(['evt-e1', 'evt-e2']);
    expect(cards[2].mergedEventIds).toEqual(['evt-d1', 'evt-d2']);
  });

  it('lists a task appearing in two different categories only once (first wins)', () => {
    const cards = mergeCarryBlocks([
      block('evt-w', 'Writing', [task('shared'), task('w1')]),
      block('evt-e', 'Engagement / Outreach', [task('shared'), task('e1')]),
    ]);

    expect(cards[0].tasks.map(t => t.id)).toEqual(['shared', 'w1']);
    expect(cards[1].tasks.map(t => t.id)).toEqual(['e1']);
  });

  it('leaves single-task blocks alone, even when they share a category', () => {
    const cards = mergeCarryBlocks([
      block('evt-a', 'General Todos', [task('a')]),
      block('evt-b', 'General Todos', [task('b')]),
    ]);

    expect(cards.map(c => c.googleEventId)).toEqual(['evt-a', 'evt-b']);
    expect(cards.every(c => c.mergedEventIds.length === 1)).toBe(true);
  });

  it('drops a card left with nothing incomplete, keeping completed members visible on the rest', () => {
    const cards = mergeCarryBlocks([
      block('evt-done', 'Batch', [task('x', { done: true }), task('y', { done: true })]),
      block('evt-open', 'Writing', [task('w1', { done: true }), task('w2')]),
      // Every task already claimed by the card above → nothing left to decide.
      block('evt-dupe', 'Writing', [task('w1', { done: true }), task('w2')]),
    ]);

    expect(cards.map(c => c.googleEventId)).toEqual(['evt-open']);
    expect(cards[0].tasks.map(t => [t.id, t.done])).toEqual([
      ['w1', true],
      ['w2', false],
    ]);
  });

  it('falls back to the title when a task has no ids at all', () => {
    const untitled = (title: string): ReplanCarryTask => ({ id: '', title, done: false });
    const cards = mergeCarryBlocks([
      block('evt-1', 'Writing', [untitled('Draft the brief'), untitled('Other')]),
      block('evt-2', 'Writing', [untitled(' draft the brief '), untitled('Third')]),
    ]);

    expect(cards).toHaveLength(1);
    expect(cards[0].tasks.map(t => t.title)).toEqual(['Draft the brief', 'Other', 'Third']);
  });
});
