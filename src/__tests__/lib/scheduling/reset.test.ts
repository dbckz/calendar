/**
 * Tests for the pure "start the week from scratch" split — which app-created
 * events are future (delete from the calendar) vs past (kept as history).
 */
import { splitWeekResetEvents, type ResetEvent } from '@/lib/scheduling/reset';

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
