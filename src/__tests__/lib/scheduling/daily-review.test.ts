import { buildReviewApplyPayload, type ReviewBlockMark } from '@/lib/scheduling/daily-review';
import type { ReplanReviewBlock } from '@/lib/scheduling/replan';

function asanaBlock(
  eventId: string,
  done: boolean,
  tasks: Array<{ gid: string; done: boolean; integrationId?: string }>
): ReplanReviewBlock {
  return {
    googleEventId: eventId,
    kind: 'task',
    category: 'Deep',
    date: '2026-07-21',
    start: '09:00',
    durationMinutes: 60,
    startMs: 0,
    endMs: 0,
    done,
    titles: tasks.map((_, i) => `Task ${i}`),
    tasks: tasks.map((t, i) => ({
      title: `Task ${i}`,
      done: t.done,
      gid: t.gid,
      integrationId: t.integrationId ?? 'int1',
    })),
  };
}

function prepBlock(eventId: string, done: boolean): ReplanReviewBlock {
  return {
    googleEventId: eventId,
    kind: 'prep',
    category: 'Meeting prep',
    date: '2026-07-21',
    start: '09:00',
    durationMinutes: 30,
    startMs: 0,
    endMs: 0,
    done,
    titles: ['Prep'],
    tasks: [{ title: 'Prep', done }],
  };
}

function adhocBlock(eventId: string, done: boolean): ReplanReviewBlock {
  return {
    googleEventId: eventId,
    kind: 'task',
    category: 'Admin',
    date: '2026-07-21',
    start: '09:00',
    durationMinutes: 30,
    startMs: 0,
    endMs: 0,
    done,
    titles: ['Errand'],
    tasks: [{ title: 'Errand', done, adhocId: 'ad1' }],
  };
}

const mark = (...tasks: Array<{ done: boolean; completeInAsana?: boolean }>): ReviewBlockMark => ({
  tasks: tasks.map(t => ({ done: t.done, completeInAsana: t.completeInAsana ?? false })),
});

describe('buildReviewApplyPayload', () => {
  it('emits nothing when marks match current state', () => {
    const blocks = [prepBlock('e1', false), asanaBlock('e2', false, [{ gid: 'g1', done: false }])];
    const out = buildReviewApplyPayload(blocks, {
      e1: mark({ done: false }),
      e2: mark({ done: false }),
    });
    expect(out).toEqual({ done: [], notDone: [], completeAsana: [] });
  });

  it('marks a prep block done', () => {
    const out = buildReviewApplyPayload([prepBlock('e1', false)], { e1: mark({ done: true }) });
    expect(out.done).toEqual(['e1']);
    expect(out.notDone).toEqual([]);
  });

  it('marks a previously-done prep block not-done', () => {
    const out = buildReviewApplyPayload([prepBlock('e1', true)], { e1: mark({ done: false }) });
    expect(out.notDone).toEqual(['e1']);
    expect(out.done).toEqual([]);
  });

  it('marks an ad-hoc block done', () => {
    const out = buildReviewApplyPayload([adhocBlock('e1', false)], { e1: mark({ done: true }) });
    expect(out.done).toEqual(['e1']);
  });

  it('completes an Asana task in Asana when the box is ticked (no override)', () => {
    const blocks = [asanaBlock('e1', false, [{ gid: 'g1', done: false }])];
    const out = buildReviewApplyPayload(blocks, {
      e1: mark({ done: true, completeInAsana: true }),
    });
    expect(out.completeAsana).toEqual([{ gid: 'g1', integrationId: 'int1' }]);
    expect(out.done).toEqual([]);
    expect(out.notDone).toEqual([]);
  });

  it('overrides the block done when an Asana task is marked done without completing in Asana', () => {
    const blocks = [asanaBlock('e1', false, [{ gid: 'g1', done: false }])];
    const out = buildReviewApplyPayload(blocks, {
      e1: mark({ done: true, completeInAsana: false }),
    });
    expect(out.done).toEqual(['e1']);
    expect(out.completeAsana).toEqual([]);
  });

  it('grouped block: completes ticked tasks, no override while another stays not-done', () => {
    const blocks = [
      asanaBlock('e1', false, [
        { gid: 'g1', done: false },
        { gid: 'g2', done: false },
      ]),
    ];
    const out = buildReviewApplyPayload(blocks, {
      e1: mark({ done: true, completeInAsana: true }, { done: false }),
    });
    expect(out.completeAsana).toEqual([{ gid: 'g1', integrationId: 'int1' }]);
    expect(out.done).toEqual([]); // partial → block stays open (missed)
    expect(out.notDone).toEqual([]);
  });

  it('grouped block: all done, mixed Asana/override → completes one, overrides block', () => {
    const blocks = [
      asanaBlock('e1', false, [
        { gid: 'g1', done: false },
        { gid: 'g2', done: false },
      ]),
    ];
    const out = buildReviewApplyPayload(blocks, {
      e1: mark({ done: true, completeInAsana: true }, { done: true, completeInAsana: false }),
    });
    expect(out.completeAsana).toEqual([{ gid: 'g1', integrationId: 'int1' }]);
    expect(out.done).toEqual(['e1']);
  });

  it('clears a done grouped block override when a task is unchecked', () => {
    const blocks = [
      asanaBlock('e1', true, [
        { gid: 'g1', done: true },
        { gid: 'g2', done: true },
      ]),
    ];
    const out = buildReviewApplyPayload(blocks, {
      e1: mark({ done: false }, { done: true }),
    });
    expect(out.notDone).toEqual(['e1']);
    expect(out.done).toEqual([]);
  });

  it('does not complete in Asana a task that is already done', () => {
    const blocks = [asanaBlock('e1', true, [{ gid: 'g1', done: true }])];
    const out = buildReviewApplyPayload(blocks, {
      e1: mark({ done: true, completeInAsana: true }),
    });
    expect(out).toEqual({ done: [], notDone: [], completeAsana: [] });
  });

  it('emits nothing for a task already complete in Asana (completedInAsana)', () => {
    // A task flagged completedInAsana arrives pre-done; even if the mark carries a
    // (defensive) completeInAsana tick, nothing is re-completed or overridden.
    const block: ReplanReviewBlock = {
      ...asanaBlock('e1', true, [{ gid: 'g1', done: true }]),
      tasks: [{ title: 'Task 0', done: true, gid: 'g1', integrationId: 'int1', completedInAsana: true }],
    };
    const out = buildReviewApplyPayload([block], {
      e1: mark({ done: true, completeInAsana: true }),
    });
    expect(out).toEqual({ done: [], notDone: [], completeAsana: [] });
  });
});
