import { format } from 'date-fns';
import { CalendarEvent, ScheduledAsanaTask } from '@/types';
import { asanaTaskGidsFromText } from '@/lib/asana-url';
import { stripLeadingEmoji } from '@/lib/scheduling/calendar-review';

// Whether an event falls on a local calendar date (yyyy-MM-dd). All-day events
// use Google's exclusive end date, so a one-day event spans [start, end).
export function isEventOnDate(event: CalendarEvent, targetDate: string): boolean {
  const startDateStr = format(event.startTime, 'yyyy-MM-dd');
  const endDateStr = format(event.endTime, 'yyyy-MM-dd');

  if (event.allDay) {
    return targetDate >= startDateStr && targetDate < endDateStr;
  }

  return startDateStr === targetDate;
}

export interface MergeEventsInputs {
  googleEvents: CalendarEvent[];
  scheduledAsanaTasks: ScheduledAsanaTask[];
  // Ad-hoc tasks already filtered (dueTime set, not synced to Google) and
  // converted to CalendarEvents by the caller.
  adhocEvents: CalendarEvent[];
  // The schedule store's events for this date; entries linked to a Google event
  // are filtered out here (they surface via the enriched Google event instead).
  scheduledAsanaEvents: CalendarEvent[];
  // Incomplete Asana tasks, for the last-resort title match. Optional — without
  // it only the schedule-link and description-URL fallbacks apply.
  allAsanaTasks?: CalendarEvent[];
}

// Combine calendar events for a given date, filtering out duplicates from
// synced Google events. Mirrors the desktop pipeline in src/app/page.tsx.
export function mergeEventsForDate(dateStr: string, inputs: MergeEventsInputs): CalendarEvent[] {
  const { googleEvents, scheduledAsanaTasks, adhocEvents, scheduledAsanaEvents, allAsanaTasks } = inputs;

  // Multiple tasks can share a title, so the map holds every gid per title (the
  // planner prefixes blocks with its own emoji), and only an unambiguous
  // single-task match links.
  const asanaGidsByTitle = new Map<string, string[]>();
  for (const t of allAsanaTasks ?? []) {
    if (t.completed) continue;
    const key = t.title.trim();
    asanaGidsByTitle.set(key, [...(asanaGidsByTitle.get(key) ?? []), t.id]);
  }

  const filteredGoogleEvents = googleEvents.filter(event => isEventOnDate(event, dateStr));

  const enrichedGoogleEvents = filteredGoogleEvents.map(event => {
    const linkedAsana = scheduledAsanaTasks.find(s => s.googleEventId === event.id);
    if (linkedAsana) {
      return {
        ...event,
        linkedAsanaTaskId: linkedAsana.asanaTaskId,
        linkedAsanaIntegrationId: linkedAsana.integrationId,
        // Use Asana color for linked events
        color: '#f06a6a',
      };
    }
    // No schedule-store link: fall back to a task URL in the description. Only
    // link when exactly one distinct task is referenced — grouped blocks with
    // several task URLs are ambiguous about which task to open, so stay
    // unlinked. Description-only links keep the event's own color and leave
    // linkedAsanaIntegrationId unset (unknown from the URL alone).
    const descGids = event.description ? asanaTaskGidsFromText(event.description) : [];
    if (descGids.length === 1) {
      return { ...event, linkedAsanaTaskId: descGids[0] };
    }
    // Last resort, for planner blocks that predate description links: match
    // the title against incomplete Asana tasks, tolerating the planner's
    // category-emoji prefix. Only an unambiguous (single-task) match links.
    const strippedTitle = stripLeadingEmoji(event.title);
    const titleGids =
      asanaGidsByTitle.get(strippedTitle) ?? asanaGidsByTitle.get(event.title.trim()) ?? [];
    if (titleGids.length === 1) {
      return { ...event, linkedAsanaTaskId: titleGids[0] };
    }
    return event;
  });

  // Exclude Asana schedules linked to Google events (shown via enrichedGoogleEvents)
  const dedupedScheduledEvents = scheduledAsanaEvents.filter(event => {
    const schedule = scheduledAsanaTasks.find(s => s.id === event.id);
    return !schedule?.googleEventId;
  });

  return [...enrichedGoogleEvents, ...adhocEvents, ...dedupedScheduledEvents];
}
