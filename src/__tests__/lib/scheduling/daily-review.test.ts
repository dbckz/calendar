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
    expect(out).toEqual({ done: [], notDone: [], completeAsana: [], adopt: [] });
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
    expect(out).toEqual({ done: [], notDone: [], completeAsana: [], adopt: [] });
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
    expect(out).toEqual({ done: [], notDone: [], completeAsana: [], adopt: [] });
  });
});

// A bare Google Calendar event surfaced in the review (source 'calendar').
function calendarBlock(
  eventId: string,
  done: boolean,
  task: { title?: string; gid?: string; integrationId?: string } = {}
): ReplanReviewBlock {
  return {
    googleEventId: eventId,
    googleIntegrationId: 'g-int1',
    kind: 'task',
    source: 'calendar',
    category: 'Calendar',
    date: '2026-07-21',
    start: '14:00',
    durationMinutes: 45,
    startMs: 0,
    endMs: 0,
    done,
    titles: [task.title ?? '🎯 Write notes'],
    tasks: [
      {
        title: task.title ?? '🎯 Write notes',
        done,
        ...(task.gid ? { gid: task.gid, integrationId: task.integrationId ?? 'int1' } : {}),
      },
    ],
  };
}

describe('buildReviewApplyPayload — calendar events', () => {
  it('adopts a not-done unmatched calendar event (emoji-stripped title, no gid)', () => {
    const out = buildReviewApplyPayload([calendarBlock('e1', false)], { e1: mark({ done: false }) });
    expect(out.adopt).toEqual([
      {
        googleEventId: 'e1',
        googleIntegrationId: 'g-int1',
        title: 'Write notes',
        date: '2026-07-21',
        start: '14:00',
        durationMinutes: 45,
      },
    ]);
    expect(out.done).toEqual([]);
    expect(out.notDone).toEqual([]);
  });

  it('adopts a not-done Asana-matched calendar event carrying its gid', () => {
    const out = buildReviewApplyPayload([calendarBlock('e1', false, { gid: 'g1', integrationId: 'int1' })], {
      e1: mark({ done: false }),
    });
    expect(out.adopt).toEqual([
      expect.objectContaining({ googleEventId: 'e1', gid: 'g1', integrationId: 'int1' }),
    ]);
  });

  it('marks a done unmatched calendar event as a planning override (no adopt)', () => {
    const out = buildReviewApplyPayload([calendarBlock('e1', false)], { e1: mark({ done: true }) });
    expect(out.done).toEqual(['e1']);
    expect(out.adopt).toEqual([]);
  });

  it('completes a done Asana-matched calendar event in Asana and records the override', () => {
    const out = buildReviewApplyPayload(
      [calendarBlock('e1', false, { gid: 'g1', integrationId: 'int1' })],
      { e1: mark({ done: true, completeInAsana: true }) }
    );
    expect(out.completeAsana).toEqual([{ gid: 'g1', integrationId: 'int1' }]);
    expect(out.done).toEqual(['e1']);
    expect(out.adopt).toEqual([]);
  });

  it('clears a stale override when a previously-done calendar event is reopened, then adopts', () => {
    const out = buildReviewApplyPayload([calendarBlock('e1', true)], { e1: mark({ done: false }) });
    expect(out.notDone).toEqual(['e1']);
    expect(out.adopt).toHaveLength(1);
  });
});
