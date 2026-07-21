/**
 * Tests for the pure "start the week from scratch" split — which app-created
 * events are future (delete from the calendar) vs past (kept as history).
 */
import {
  splitWeekResetEvents,
  selectUntrackedPrepEvents,
  type ResetEvent,
  type WeekCalendarEvent,
} from '@/lib/scheduling/reset';

function at(date: string, time: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, m] = time.split(':').map(Number);
  return new Date(y, mo - 1, d, h, m, 0, 0).getTime();
}

const NOW = at('2026-07-15', '12:00'); // Wednesday noon

function evt(id: string, startMs: number, googleIntegrationId = 'g1'): ResetEvent {
  return { googleEventId: id, googleIntegrationId, startMs };
}

describe('splitWeekResetEvents', () => {
  it('deletes future events and keeps past ones as history', () => {
    const { toDelete, pastKept } = splitWeekResetEvents(
      [
        evt('past', at('2026-07-14', '09:00')), // yesterday
        evt('future', at('2026-07-17', '09:00')), // Friday
      ],
      NOW
    );
    expect(toDelete.map(e => e.googleEventId)).toEqual(['future']);
    expect(pastKept.map(e => e.googleEventId)).toEqual(['past']);
  });

  it('treats an already-started block as past (not deleted)', () => {
    const { toDelete, pastKept } = splitWeekResetEvents(
      [evt('earlier-today', at('2026-07-15', '09:00'))],
      NOW
    );
    expect(toDelete).toHaveLength(0);
    expect(pastKept.map(e => e.googleEventId)).toEqual(['earlier-today']);
  });

  it('collapses events shared by several records to a single decision', () => {
    // A grouped block records several tasks against ONE event — it must appear
    // once, decided by its first-seen start.
    const { toDelete } = splitWeekResetEvents(
      [
        evt('grouped', at('2026-07-17', '14:00')),
        evt('grouped', at('2026-07-17', '14:00')),
        evt('grouped', at('2026-07-17', '14:00')),
      ],
      NOW
    );
    expect(toDelete).toHaveLength(1);
    expect(toDelete[0].googleEventId).toBe('grouped');
  });

  it('ignores entries with no event id', () => {
    const { toDelete, pastKept } = splitWeekResetEvents(
      [{ googleEventId: '', googleIntegrationId: 'g1', startMs: at('2026-07-17', '09:00') }],
      NOW
    );
    expect(toDelete).toHaveLength(0);
    expect(pastKept).toHaveLength(0);
  });

  it('carries the integration id through so the route can route deletions', () => {
    const { toDelete } = splitWeekResetEvents([evt('f', at('2026-07-17', '09:00'), 'gABC')], NOW);
    expect(toDelete[0].googleIntegrationId).toBe('gABC');
  });
});

describe('selectUntrackedPrepEvents', () => {
  function cal(
    id: string,
    title: string,
    startMs: number,
    integrationId = 'g1'
  ): WeekCalendarEvent {
    return { id, title, startMs, integrationId, calendarId: 'primary' };
  }

  it('deletes an untracked FUTURE "Prep:" event', () => {
    const out = selectUntrackedPrepEvents(
      [cal('p1', 'Prep: Board sync', at('2026-07-17', '09:00'))],
      new Set(),
      NOW
    );
    expect(out.map(e => e.googleEventId)).toEqual(['p1']);
    expect(out[0].googleIntegrationId).toBe('g1');
    expect(out[0].calendarId).toBe('primary');
  });

  it('leaves an untracked PAST "Prep:" event as history', () => {
    const out = selectUntrackedPrepEvents(
      [cal('p-past', 'Prep: Yesterday call', at('2026-07-14', '09:00'))],
      new Set(),
      NOW
    );
    expect(out).toHaveLength(0);
  });

  it('does not re-select a tracked event (no double-counting)', () => {
    // The event is already covered by the record-driven split, so it must not
    // also come back through the untracked-prep path.
    const out = selectUntrackedPrepEvents(
      [cal('tracked', 'Prep: Board sync', at('2026-07-17', '09:00'))],
      new Set(['tracked']),
      NOW
    );
    expect(out).toHaveLength(0);
  });

  it('never touches a non-prep untracked event', () => {
    const out = selectUntrackedPrepEvents(
      [cal('meeting', 'Board sync', at('2026-07-17', '09:00'))],
      new Set(),
      NOW
    );
    expect(out).toHaveLength(0);
  });

  it('collapses a duplicate event id to a single deletion', () => {
    const out = selectUntrackedPrepEvents(
      [
        cal('dup', 'Prep: Board sync', at('2026-07-17', '09:00')),
        cal('dup', 'Prep: Board sync', at('2026-07-17', '09:00')),
      ],
      new Set(),
      NOW
    );
    expect(out).toHaveLength(1);
    expect(out[0].googleEventId).toBe('dup');
  });
});
