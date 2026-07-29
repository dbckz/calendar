// Which bare calendar events are NOT tasks, for the daily review's "what got
// done?" step.
//
// Events Dave adds straight into Google Calendar are surfaced in the review as
// solo work (see calendar-review.ts). Some are plainly not work: a wake-up marker
// ("WAKE"), a personal ritual prompt ("MPs - gratitude"), an appointment, a
// holiday. Those are filtered here.
//
// This filter is DELIBERATELY CONSERVATIVE. Dave would rather be asked about one
// event too many than silently lose a real one, and meetings / 1:1s / calls /
// catch-ups CAN be work he wants to record — so they are no longer filtered here.
// The primary tool for the rest is the manual "Not relevant" dismissal in the
// review (it records a permanent verdict per title), not this list. When in
// doubt, DON'T add a heuristic — let the event through and let Dave dismiss it.
//
// Two layers do the automatic filtering:
//  * this module — deterministic, I/O-free title heuristics for the unambiguous
//    non-work shapes (markers, personal routines, appointments, time away).
//    Cheap, unit-testable, no LLM call.
//  * review-task-classifier.ts — an AI verdict, cached per normalized title, for
//    everything the heuristics don't judge (a bare first name being the main one).
//
// Deliberately kept separate from isPersonalLikeTitle (rituals.ts), which decides
// what counts as WORKED TIME. A work dinner or a catch-up is genuinely work time
// but still isn't necessarily a task to tick off, so the two lists must not be
// merged.

import { isPrepTitle } from './event-titles';
import { isPersonalLikeTitle, isRitualLikeTitle } from './rituals';

// Stable key for a review title: leading emoji dropped, lowercased, whitespace
// collapsed. Verdicts (the user's dismissals and the AI's) are remembered per
// key, so "WAKE", "Wake" and "⏰ wake" share one decision.
export function normalizeReviewTitleKey(title: string): string {
  return title
    .replace(/^[\s\p{Extended_Pictographic}\u{FE0F}\u{200D}]+/u, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Emoji prefixes Dave uses for things that are never work to tick off: a gym
// session, a personal errand, a marker. Matched at the START of the title (his own
// convention), and deliberately separate from the personal-like emojis in
// rituals.ts, which govern WORKED TIME rather than what the review asks about.
//
// 📞 (a call) is intentionally NOT here: calls are now reviewable work — Dave may
// want to record a call's outcome — so a "📞 …" event must reach the review.
export const NON_TASK_TITLE_EMOJIS: readonly string[] = [
  '🏋️', // gym session
  '⏰', // an alarm / marker
  '🙏', // a gratitude or prayer prompt
  '🎵', // music, gigs
  '🧺', // laundry / dry cleaning
  '🧳', // packing
  '🛏️', // bed / wind-down
  '🍽️', // meals
  '☕', // breaks
];

// Whole-title markers: an entry that marks a moment or a state in the day rather
// than any work — a wake-up/bedtime marker, a hold, a buffer.
export const MARKER_TITLES: readonly string[] = [
  'wake',
  'wake up',
  'awake',
  'up',
  'sleep',
  'asleep',
  'bed',
  'bedtime',
  'hold',
  'busy',
  'blocked',
  'buffer',
  'free',
  'ooo',
  'out of office',
  'commute',
  'travel',
  'lunch break',
  'break',
];

// Terms matched ANYWHERE in the title (case-insensitively): personal routines,
// appointments, life admin and clearly-personal social occasions. None of these
// is a piece of work with an outcome to tick off.
//
// Meal / social terms that CAN be work (breakfast, brunch, dinner, coffee, drinks,
// pub) are deliberately NOT here — "Coffee with a partner" or a "Team dinner" is
// reviewable. Only the unambiguously personal occasions stay (date night,
// birthday, anniversary, wedding, funeral).
export const NON_TASK_TERMS: readonly string[] = [
  // personal routines / practices
  'gratitude',
  'journal',
  'meditat',
  'mindful',
  'yoga',
  'stretch',
  'prayer',
  // clearly-personal social occasions
  'date night',
  'birthday',
  'anniversary',
  'wedding',
  'funeral',
  // appointments / life admin
  'haircut',
  'barber',
  'dentist',
  'dental',
  'doctor',
  'optician',
  'physio',
  'therapy',
  'massage',
  'hospital',
  'appointment',
  'school run',
  'nursery',
  'pick up',
  'pickup',
  'drop off',
  'dropoff',
  'babysit',
  // time away
  'holiday',
  'day off',
  'annual leave',
  'vacation',
  'half day',
];

// Title SHAPES that are still not work despite the loosening. A leftover
// placeholder is the only one: "HOLD: fundraising strategy" marks a reserved slot,
// not an activity. The meeting / call / catch-up / "X?" shapes were removed on
// purpose — each of those can be genuine work Dave wants to review, so they now
// reach the review and the manual "Not relevant" dismissal handles the rest.
const PLACEHOLDER_SHAPES: readonly RegExp[] = [
  /^hold\b/i, // "HOLD: fundraising strategy" — a placeholder, not work
];

// True when a bare calendar-event title clearly isn't a task to mark done.
// Rituals and personal-like titles (a cycle to football, a flight) count too, so
// the review has one predicate to ask.
export function isNotTaskLikeTitle(title: string): boolean {
  if (!title) return true;
  const key = normalizeReviewTitleKey(title);
  if (!key) return true;
  // Meeting prep IS work to tick off, so it is checked first (its titles can be
  // meeting-shaped, e.g. "📖 Prep: 1:1 Dave & Lacey").
  if (isPrepTitle(title.trim())) return false;
  if (isRitualLikeTitle(title) || isPersonalLikeTitle(title)) return true;
  const trimmed = title.trim();
  if (NON_TASK_TITLE_EMOJIS.some(emoji => trimmed.startsWith(emoji))) return true;
  if (MARKER_TITLES.includes(key)) return true;
  if (NON_TASK_TERMS.some(term => key.includes(term))) return true;
  return PLACEHOLDER_SHAPES.some(re => re.test(key));
}
