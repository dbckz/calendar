// Shared ritual-event creation: create the Google calendar event for a ritual
// block (lunch / exercise / emails) as opaque/busy time and record the ritual
// block so the planner can dedupe, reconcile, reset and re-slot it. Used by both
// the weekly-plan confirm route (initial placement) and the mid-week replan
// confirm route (filling a missing ritual), so the two never drift.

import { createCalendarEvent } from '@/lib/google-calendar';
import { addRitualBlock } from '@/lib/user-data-storage';
import { colorIdForBlock, eventTitleForBlock } from '@/lib/scheduling/event-titles';
import type { ProposedBlock } from '@/lib/scheduling/types';
import type { GoogleCalendarCredentials, GoogleIntegration } from '@/types';

// Build local start/end Dates from a yyyy-MM-dd date + HH:mm start + duration.
function toStartEnd(date: string, start: string, durationMinutes: number): { start: Date; end: Date } {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, m] = start.split(':').map(Number);
  const startDate = new Date(y, mo - 1, d, h, m, 0, 0);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
  return { start: startDate, end: endDate };
}

// Create the ritual event on the already-resolved Google integration (the caller
// routes rituals to the configured ritual calendar, else the default) and store
// its ritual record. Returns the created Google event id.
export async function createRitualEvent(
  resolved: { integration: GoogleIntegration; credentials: GoogleCalendarCredentials },
  block: ProposedBlock
): Promise<string> {
  const { integration, credentials } = resolved;
  const { start, end } = toStartEnd(block.date, block.start, block.durationMinutes);
  const title = eventTitleForBlock(block);
  const event = await createCalendarEvent(
    credentials,
    integration.clientId,
    integration.clientSecret,
    title,
    start,
    end,
    block.reason,
    'default',
    'primary',
    { transparency: 'opaque', colorId: colorIdForBlock(block) }
  );
  await addRitualBlock({
    googleEventId: event.id,
    googleIntegrationId: integration.id,
    title,
    date: block.date,
    start: block.start,
    durationMinutes: block.durationMinutes,
  });
  return event.id;
}
