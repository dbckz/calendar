/**
 * Tests for task-ranking.ts - pure ranking logic for Top Tasks
 */
import { rankTasks } from '@/lib/task-ranking';
import { CalendarEvent, TaskMetadata } from '@/types';

function makeTask(id: string, dueOn?: string): CalendarEvent {
  return {
    id,
    title: `Task ${id}`,
    startTime: new Date(),
    endTime: new Date(),
    source: 'asana',
    completed: false,
    dueOn,
  };
}

function meta(overrides: Partial<TaskMetadata>): TaskMetadata {
  return {
    asanaTaskGid: overrides.asanaTaskGid || 'x',
    integrationId: 'int',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('rankTasks', () => {
  it('puts hard-deadline tasks first', () => {
    const tasks = [makeTask('a', '2026-12-01'), makeTask('b', '2026-06-01')];
    const metadata: Record<string, TaskMetadata> = {
      a: meta({ asanaTaskGid: 'a', deadlineType: 'hard' }),
    };
    const result = rankTasks(tasks, metadata);
    expect(result[0].id).toBe('a'); // hard deadline beats earlier due date
  });

  it('sorts by due date when deadline type is equal', () => {
    const tasks = [makeTask('a', '2026-12-01'), makeTask('b', '2026-06-01')];
    const result = rankTasks(tasks, {});
    expect(result.map(t => t.id)).toEqual(['b', 'a']);
  });

  it('sorts tasks with no due date last', () => {
    const tasks = [makeTask('a'), makeTask('b', '2026-06-01')];
    const result = rankTasks(tasks, {});
    expect(result.map(t => t.id)).toEqual(['b', 'a']);
  });

  it('sorts AI-delegable tasks last within a tie', () => {
    const tasks = [makeTask('a', '2026-06-01'), makeTask('b', '2026-06-01')];
    const metadata: Record<string, TaskMetadata> = {
      a: meta({ asanaTaskGid: 'a', aiDelegable: true }),
    };
    const result = rankTasks(tasks, metadata);
    expect(result.map(t => t.id)).toEqual(['b', 'a']);
  });

  it('does not mutate the input array', () => {
    const tasks = [makeTask('a', '2026-12-01'), makeTask('b', '2026-06-01')];
    const copy = [...tasks];
    rankTasks(tasks, {});
    expect(tasks).toEqual(copy);
  });
});
