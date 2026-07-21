// Pure "reconcile stored schedule with the live calendar" decision.
//
// Plan-my-week and Replan act on stored records (scheduled Asana tasks, ad-hoc
// tasks, prep blocks). When the user deletes a planned block straight off the
// calendar, the stored record is left behind — it keeps suppressing candidates
// and consuming quota even though the block no longer exists. This module
// decides, from the week's fetched events, which stored records point at an
// event that is GONE and should therefore be purged.
//
// It is I/O-free and deterministic so it can be unit-tested in isolation; the
// gather step feeds it the fetched events and applies the purge.

export type ReconcileRecordKind = 'asana' | 'adhoc' | 'prep';

// A stored record that owns a Google event. `id` identifies the record within
// its store (schedule-entry id / ad-hoc id / prep-block id). `date` is the
// record's in-week anchor (scheduledDate / dueDate / prep date).
export interface ReconcileRecord {
  kind: ReconcileRecordKind;
  id: string;
  googleEventId: string;
  googleIntegrationId?: string;
  date?: string; // yyyy-MM-dd
}

export interface ReconcileInput {
  records: ReconcileRecord[];
  // Event ids present in the week's fetch (the live calendar).
  presentEventIds: Set<string>;
  // Integrations whose week fetch fully succeeded. A record on an integration
  // NOT in this set is skipped — a failed/partial fetch must never be read as
  // "the event was deleted".
  fetchedIntegrationIds: Set<string>;
  weekStartStr: string;
  weekEndStr: string;
}

// Return the records whose backing event was deleted by the user and should be
// purged. A record is stale only when ALL of these hold:
//   * it has a googleEventId and a googleIntegrationId,
//   * its date falls within the fetched week,
//   * its integration's fetch fully succeeded, AND
//   * its event id is absent from the live calendar.
// Any record that fails a precondition is left untouched (conservative).
export function selectStaleRecords(input: ReconcileInput): ReconcileRecord[] {
  const { records, presentEventIds, fetchedIntegrationIds, weekStartStr, weekEndStr } = input;
  const inWeek = (d?: string): boolean => !!d && d >= weekStartStr && d <= weekEndStr;

  return records.filter(r => {
    if (!r.googleEventId || !r.googleIntegrationId) return false;
    if (!inWeek(r.date)) return false;
    // Can't verify deletion unless this integration's fetch actually succeeded.
    if (!fetchedIntegrationIds.has(r.googleIntegrationId)) return false;
    return !presentEventIds.has(r.googleEventId);
  });
}
