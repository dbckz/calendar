// Single source of truth for the titles of app-created calendar events.
//
// Every event the planner creates (task / grouped / reserved / prep / ritual
// blocks) is titled here so the emoji conventions live in one place and the
// title-parsing helpers (prep dedupe, reset sweep, replan) all agree.
//
// Emoji conventions:
//  * task / grouped / reserved blocks → a category emoji prefix (a single-task
//    block whose title already leads with an emoji is left untouched).
//  * prep blocks → "📖 Prep: <meeting>". Legacy prep events (created before the
//    emoji convention) are titled "Prep: <meeting>"; matching accepts BOTH.
//  * rituals → already emoji'd in rituals.ts ("🍽️ Lunch" / "📧 Emails"); their
//    titles are routed through eventTitleForBlock so this stays the one path.

import { normalize } from '@/lib/capacity';

import type { ProposedBlock } from './types';

// Prep-title prefixes. Legacy events predate the emoji; new events carry it.
export const LEGACY_PREP_TITLE_PREFIX = 'Prep: ';
export const PREP_TITLE_PREFIX = '📖 Prep: ';

// True for both legacy ("Prep: X") and emoji ("📖 Prep: X") prep titles.
export function isPrepTitle(title: string): boolean {
  return title.startsWith(PREP_TITLE_PREFIX) || title.startsWith(LEGACY_PREP_TITLE_PREFIX);
}

// Strip either prep prefix, returning the meeting title. Non-prep titles are
// returned unchanged.
export function prepMeetingTitleFromEvent(title: string): string {
  if (title.startsWith(PREP_TITLE_PREFIX)) return title.slice(PREP_TITLE_PREFIX.length);
  if (title.startsWith(LEGACY_PREP_TITLE_PREFIX)) return title.slice(LEGACY_PREP_TITLE_PREFIX.length);
  return title;
}

// Build the emoji prep title for a meeting.
export function prepTitle(meetingTitle: string): string {
  return `${PREP_TITLE_PREFIX}${meetingTitle}`;
}

// Category → emoji. Matched with the whitespace-robust normalize (so
// "Writing / Deep Work" and "Writing/Deep Work" map the same).
const CATEGORY_EMOJI: ReadonlyArray<readonly [string, string]> = [
  ['Writing/Deep Work', '✍️'],
  ['Blogs', '📝'],
  ['Batch', '📦'],
  ['Engagement/Outreach', '🤝'],
  ['General Todos', '✅'],
  ['Meeting prep', '📖'],
];
const UNKNOWN_CATEGORY_EMOJI = '🗂️';

export function categoryEmoji(category: string): string {
  const n = normalize(category);
  for (const [cat, emoji] of CATEGORY_EMOJI) {
    if (normalize(cat) === n) return emoji;
  }
  return UNKNOWN_CATEGORY_EMOJI;
}

// Whether a title already leads with an emoji (many ad-hoc task titles do, e.g.
// "🎯 Focus time: …"), so we don't double-prefix. Uses the unicode pictographic
// property; a leading space is tolerated.
const LEADING_EMOJI = /^\s*\p{Extended_Pictographic}/u;
export function startsWithEmoji(title: string): boolean {
  return LEADING_EMOJI.test(title);
}

// Title for a single-task block: keep an existing leading emoji, else prefix the
// category emoji.
export function taskBlockTitle(taskTitle: string, category: string): string {
  return startsWithEmoji(taskTitle) ? taskTitle : `${categoryEmoji(category)} ${taskTitle}`;
}

// Title for a grouped block (shared container, e.g. "🤝 Engagement / Outreach").
export function categoryBlockTitle(category: string): string {
  return `${categoryEmoji(category)} ${category}`;
}

// Title for a reserved block ("✍️ Writing/Deep Work block").
export function reservedBlockTitle(category: string): string {
  return `${categoryEmoji(category)} ${category} block`;
}

// The calendar-event title for any proposed block. The single place that turns a
// ProposedBlock into its event title, used by the confirm route.
export function eventTitleForBlock(block: ProposedBlock): string {
  if (block.kind === 'prep') {
    return prepTitle(block.meeting?.title ?? block.category);
  }
  if (block.kind === 'ritual') {
    // Rituals are already emoji'd in rituals.ts; route through here so titles
    // have one source of truth.
    return block.title ?? block.category;
  }
  if (Array.isArray(block.tasks)) {
    return categoryBlockTitle(block.category);
  }
  if (!block.task) {
    return reservedBlockTitle(block.category);
  }
  return taskBlockTitle(block.task.title, block.category);
}
