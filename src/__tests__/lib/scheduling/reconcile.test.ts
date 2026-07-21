/**
 * Tests for the pure reconcile decision — which stored records point at a
 * calendar event that has been deleted and should therefore be purged.
 */
import { selectStaleRecords, type ReconcileRecord } from '@/lib/scheduling/reconcile';

const WEEK_START = '2026-07-13';
const WEEK_END = '2026-07-19';

function record(o: Partial<ReconcileRecord> & { id: string }): ReconcileRecord {
  return {
    kind: 'asana',
    googleEventId: `evt-${o.id}`,
    googleIntegrationId: 'g1',
    date: '2026-07-15',
    ...o,
  };
}

function run(o: {
  records: ReconcileRecord[];
  present?: string[];
  fetched?: string[];
}) {
  return selectStaleRecords({
    records: o.records,
    presentEventIds: new Set(o.present ?? []),
    fetchedIntegrationIds: new Set(o.fetched ?? ['g1']),
    weekStartStr: WEEK_START,
    weekEndStr: WEEK_END,
  });
}

describe('selectStaleRecords', () => {
  it('purges a record whose event is gone from a fully-fetched integration', () => {
    const rec = record({ id: 'a' }); // evt-a, on g1, in-week
    const stale = run({ records: [rec], present: [], fetched: ['g1'] });
    expect(stale).toHaveLength(1);
    expect(stale[0].id).toBe('a');
  });

  it('keeps a record whose event is still present on the calendar', () => {
    const rec = record({ id: 'b' });
    const stale = run({ records: [rec], present: ['evt-b'], fetched: ['g1'] });
    expect(stale).toHaveLength(0);
  });

  it('skips a record on an integration whose fetch did not succeed', () => {
    // Event absent, but its integration (g2) is not in the fetched set — a
    // failed/partial fetch must never be read as "deleted".
    const rec = record({ id: 'c', googleIntegrationId: 'g2' });
    const stale = run({ records: [rec], present: [], fetched: ['g1'] });
    expect(stale).toHaveLength(0);
  });

  it('skips a record with no integration id (cannot verify)', () => {
    const rec = record({ id: 'd', googleIntegrationId: undefined });
    const stale = run({ records: [rec], present: [], fetched: ['g1'] });
    expect(stale).toHaveLength(0);
  });

  it('skips a record whose date falls outside the fetched week', () => {
    const rec = record({ id: 'e', date: '2026-07-06' }); // last week
    const stale = run({ records: [rec], present: [], fetched: ['g1'] });
    expect(stale).toHaveLength(0);
  });

  it('skips a record with no googleEventId', () => {
    const rec = record({ id: 'f', googleEventId: '' });
    const stale = run({ records: [rec], present: [], fetched: ['g1'] });
    expect(stale).toHaveLength(0);
  });

  it('purges across kinds and only the deleted ones', () => {
    const records = [
      record({ id: 'asana-gone', kind: 'asana' }),
      record({ id: 'adhoc-gone', kind: 'adhoc' }),
      record({ id: 'prep-gone', kind: 'prep' }),
      record({ id: 'present', googleEventId: 'evt-present' }),
    ];
    const stale = run({ records, present: ['evt-present'], fetched: ['g1'] });
    expect(stale.map(r => r.id).sort()).toEqual(['adhoc-gone', 'asana-gone', 'prep-gone']);
  });
});
