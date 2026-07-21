// Pure "start the week from scratch" decision.
//
// Resetting the week deletes the app-created blocks that are still in the FUTURE
// from the calendar (so the upcoming days clear out) but leaves past blocks on
// the calendar as history. This module makes only that past/future split — a
// deterministic, I/O-free decision the reset route feeds with the week's blocks
// and then acts on (deleting the future ones, clearing every in-week record).

export interface ResetEvent {
  googleEventId: string;
  googleIntegrationId?: string;
  startMs: number; // the block's absolute start
}

export interface ResetSplit {
  // Future events (start strictly after now) → delete from the calendar.
  toDelete: ResetEvent[];
  // Past events (already started) → left on the calendar as history.
  pastKept: ResetEvent[];
}

// Split the week's app blocks into the future events to delete and the past
// events to keep. Blocks sharing a googleEventId (a grouped block records
// several tasks against one event) collapse to a single event, decided by its
// first-seen start.
export function splitWeekResetEvents(events: ResetEvent[], nowMs: number): ResetSplit {
  const seen = new Set<string>();
  const toDelete: ResetEvent[] = [];
  const pastKept: ResetEvent[] = [];

  for (const e of events) {
    if (!e.googleEventId || seen.has(e.googleEventId)) continue;
    seen.add(e.googleEventId);
    if (e.startMs > nowMs) toDelete.push(e);
    else pastKept.push(e);
  }

  return { toDelete, pastKept };
}
