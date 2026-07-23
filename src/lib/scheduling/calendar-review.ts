// Pure selection + Asana-matching for the daily-review "ad-hoc calendar event"
// source.
//
// The analyze route builds review blocks from the LOCAL stores (scheduled Asana
// tasks, ad-hoc tasks, prep blocks). Events the user adds straight into Google
// Calendar have no local record, so they never got reviewed. selectCalendarReviewBlocks()
// picks the ones that look like solo work (not meetings, not rituals, not app
// blocks) and turns each into a review block, matching it to an incomplete Asana
// task where possible so the "Complete in Asana" affordance can appear.
//
// Kept I/O-free (every input is passed in) so the route stays thin and the
// selection heuristic is unit-testable.

import type { CalendarEvent } from '@/types';

import { asanaTaskGidsFromText } from '@/lib/asana-url';
import { formatLocalDate } from '@/lib/date-utils';
import type { ReplanReviewBlock } from './replan';

const MS_PER_MINUTE = 60 * 1000;

// Strip a single leading category/emoji prefix (plus its optional variation
// selector and trailing space) from a title. Shared with the client's
// title-based Asana matching so both agree on how the planner's "🎯 Task name"
// prefix is removed before comparison.
export function stripLeadingEmoji(title: string): string {
  return title.replace(/^\s*\p{Extended_Pictographic}️?\s+/u, '').trim();
}

// An incomplete Asana task available to match a calendar event against.
export interface AsanaMatchTask {
  gid: string;
  name: string;
  integrationId: string;
}

export interface CalendarReviewInput {
  // This week's fetched calendar events (the same list the replan analyze uses).
  events: CalendarEvent[];
  // Event ids already owned by a local record (scheduled Asana / ad-hoc / prep /
  // ritual). Those are reviewed via their own source, so skip them here.
  appEventIds: Set<string>;
  // Exact ritual titles (e.g. "🍽️ Lunch") so a manually-added ritual event with
  // no local record is still skipped.
  ritualTitles: ReadonlySet<string>;
  nowMs: number;
  // Whether a yyyy-MM-dd falls in the reviewed week — matches the scope the other
  // review sources use (in-week + already ended).
  inWeek: (dateStr: string) => boolean;
  // Events already marked done for planning: kept in the review but pre-ticked so
  // they don't re-prompt (and won't be re-adopted).
  doneOverrides: Record<string, unknown>;
  // Live incomplete Asana tasks to match against (title + single-URL matching).
  asanaTasks: AsanaMatchTask[];
}

function localTimeStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Find the incomplete Asana task backing an event, mirroring the client's
// priority (src/app/page.tsx): (a) a single distinct task URL in the description,
// (b) an unambiguous title match (emoji-prefix tolerant). Returns the match or
// null. Only INCOMPLETE tasks are considered, so an event whose task is already
// complete stays unmatched (nothing left to complete).
function matchAsanaTask(
  event: CalendarEvent,
  byGid: Map<string, AsanaMatchTask>,
  gidsByTitle: Map<string, string[]>
): AsanaMatchTask | null {
  const descGids = event.description ? asanaTaskGidsFromText(event.description) : [];
  if (descGids.length === 1) {
    const hit = byGid.get(descGids[0]);
    if (hit) return hit;
  }
  const stripped = stripLeadingEmoji(event.title);
  const titleGids = gidsByTitle.get(stripped) ?? gidsByTitle.get(event.title.trim()) ?? [];
  if (titleGids.length === 1) {
    const hit = byGid.get(titleGids[0]);
    if (hit) return hit;
  }
  return null;
}

// Select the ad-hoc calendar events to surface in the daily review. Each result
// is a `source: 'calendar'` review block carrying the event's real interval and,
// when matched, the Asana gid/integrationId so it can be completed in Asana or
// adopted as a scheduled Asana block on confirm.
export function selectCalendarReviewBlocks(input: CalendarReviewInput): ReplanReviewBlock[] {
  const byGid = new Map<string, AsanaMatchTask>();
  const gidsByTitle = new Map<string, string[]>();
  for (const t of input.asanaTasks) {
    byGid.set(t.gid, t);
    const key = t.name.trim();
    gidsByTitle.set(key, [...(gidsByTitle.get(key) ?? []), t.gid]);
  }

  const blocks: ReplanReviewBlock[] = [];
  for (const event of input.events) {
    if (event.allDay) continue;
    if (input.appEventIds.has(event.id)) continue;
    if (input.ritualTitles.has(event.title.trim())) continue;
    // Meetings (anyone else invited) are not solo work → skip. attendeeCount is
    // undefined for events with no attendee list (solo, owned) and 1 for
    // self-only; both are reviewable. 2+ means other attendees.
    if ((event.attendeeCount ?? 0) >= 2) continue;

    const startMs = event.startTime.getTime();
    const endMs = event.endTime.getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) continue;
    // Same scope as the other review sources: in-week and already ended.
    if (!input.inWeek(formatLocalDate(event.startTime))) continue;
    if (endMs > input.nowMs) continue;

    const done = !!input.doneOverrides[event.id];
    const match = matchAsanaTask(event, byGid, gidsByTitle);
    const durationMinutes = Math.max(1, Math.round((endMs - startMs) / MS_PER_MINUTE));

    blocks.push({
      googleEventId: event.id,
      googleIntegrationId: event.integrationId,
      kind: 'task',
      source: 'calendar',
      category: 'Calendar',
      date: formatLocalDate(event.startTime),
      start: localTimeStr(event.startTime),
      durationMinutes,
      startMs,
      endMs,
      done,
      titles: [event.title],
      tasks: [
        {
          title: event.title,
          done,
          ...(match ? { gid: match.gid, integrationId: match.integrationId } : {}),
        },
      ],
    });
  }
  return blocks;
}
