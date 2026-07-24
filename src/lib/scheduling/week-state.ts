// Pure week-state machine behind the dashboard's single adaptive planning
// button.
//
// The dashboard used to show "Plan my week" and "Replan week" side by side, and
// the right one to press depended on knowledge the UI never had: whether this
// week was ever planned, whether it is Friday, whether the end-of-week review is
// done, whether next week already has a plan. This derives that decision once,
// from cheap stored signals, so the button can simply say what to do next.
//
// I/O-free by design (every input is passed in), like the rest of scheduling/.
// The escape-hatch menu in the UI always offers EVERY action regardless of the
// state here, so a wrong derivation can never trap the user.

import { addDays, format, startOfWeek } from 'date-fns';

import { DEFAULT_WORKING_DAYS } from './end-of-week';

export type WeekAction =
  | 'plan-this-week' // no plan yet, mid-week
  | 'replan' // this week is planned, mid-week
  | 'wrap-up' // end of week, review still to do
  | 'plan-next-week' // end of week, review done, next week unplanned
  | 'replan-next-week'; // end of week, next week already planned

export interface WeekStateInput {
  // Does the CURRENT week have app-created blocks / plan artefacts?
  currentWeekPlanned: boolean;
  // Is the logical today the last working day of the week, or later?
  endOfWeek: boolean;
  // Has a daily review been completed on/after the start of the last working day?
  endOfWeekReviewDone: boolean;
  // Does the NEXT week already have app-created blocks?
  nextWeekPlanned: boolean;
  // Is there anything for the wrap-up review to ask about (a planned block this
  // week that has already ended)? False → the wrap-up gate is skipped: a week
  // that was never planned has nothing to review.
  hasReviewableBlocks: boolean;
}

export function deriveWeekAction(input: WeekStateInput): WeekAction {
  if (!input.endOfWeek) {
    return input.currentWeekPlanned ? 'replan' : 'plan-this-week';
  }
  // End of week. An existing plan for next week takes precedence over the
  // review gate: once next week is planned, the useful action is fixing it up.
  if (input.nextWeekPlanned) return 'replan-next-week';
  if (!input.endOfWeekReviewDone && input.hasReviewableBlocks) return 'wrap-up';
  return 'plan-next-week';
}

// Button copy per state. The sub-caption is a short "why this button" hint; the
// dashboard renders it only when present.
export const WEEK_ACTION_LABELS: Record<WeekAction, { label: string; caption?: string; title: string }> = {
  'plan-this-week': {
    label: 'Plan this week',
    title: 'Plan this week — nothing is scheduled yet',
  },
  replan: {
    label: 'Replan week',
    title: 'Replan the rest of this week — reschedule missed or newly-clashing blocks',
  },
  'wrap-up': {
    label: 'Wrap up the week',
    caption: 'End-of-week review pending',
    title: 'Review what got done and carry the rest into next week',
  },
  'plan-next-week': {
    label: 'Plan next week',
    caption: 'This week is done',
    title: 'Plan next week',
  },
  'replan-next-week': {
    label: 'Replan next week',
    caption: 'Next week is planned',
    title: 'Replan next week — fix clashes in the plan you already made',
  },
};

// Which week each action targets: 'current' or 'next' (yyyy-MM-dd Mondays are
// resolved by the caller from the same week-start convention as everything else).
export function targetWeekForAction(action: WeekAction): 'current' | 'next' {
  return action === 'plan-next-week' || action === 'replan-next-week' ? 'next' : 'current';
}

// The last working day of the week containing `weekStart`, as yyyy-MM-dd.
// Unrecognised day names are ignored; an empty/unusable list falls back to
// Mon–Fri, matching isEndOfWeekReview.
export function lastWorkingDayOfWeek(weekStart: Date, workingDays?: string[]): string {
  const names = new Set(
    (workingDays?.length ? workingDays : DEFAULT_WORKING_DAYS).map(d => d.trim().toLowerCase())
  );
  let last = 4; // Friday, Monday-indexed
  for (let i = 6; i >= 0; i--) {
    const day = addDays(weekStart, i);
    if (names.has(format(day, 'EEEE').toLowerCase())) {
      last = i;
      break;
    }
  }
  return format(addDays(weekStart, last), 'yyyy-MM-dd');
}

// Has the end-of-week review been completed? True when the last completed review
// happened on/after the START of this week's last working day — an earlier
// review in the week (e.g. Wednesday's) does not close out the week.
export function isEndOfWeekReviewDone(
  lastReviewedAt: string | undefined,
  weekStart: Date,
  workingDays?: string[]
): boolean {
  if (!lastReviewedAt) return false;
  const reviewedMs = Date.parse(lastReviewedAt);
  if (Number.isNaN(reviewedMs)) return false;
  const [y, m, d] = lastWorkingDayOfWeek(weekStart, workingDays).split('-').map(Number);
  return reviewedMs >= new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

// yyyy-MM-dd Monday of the week containing `date`.
export function weekStartStrFor(date: Date): string {
  return format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
}
