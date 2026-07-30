// Pure decision logic for the weekly planning nudges.
//
// Two moments are worth interrupting for, and only two:
//   * Friday evening with the end-of-week review still undone — the review is
//     what turns a week's work into carry-overs and stats, and it is easy to
//     walk away from a Friday without it.
//   * Sunday evening with next week still unplanned — the last useful moment to
//     plan before Monday morning.
//
// Both are derived from the week-state machine rather than from the clock alone,
// so a week that was already reviewed or planned never nags. At most one nudge
// per logical day: this is a reminder, not an alarm.

import type { WeekAction } from '@/lib/scheduling/week-state';

export type NudgeKind = 'wrap-up' | 'plan-next-week';

export interface NudgeInput {
  action: WeekAction;
  // The logical now (honouring the day-rollover hour), so a late Friday night
  // still counts as Friday.
  now: Date;
  nextWeekPlanned: boolean;
  // yyyy-MM-dd of the logical day a nudge was last fired on, if any.
  lastNudgedDay?: string;
  logicalToday: string; // yyyy-MM-dd
  // Whether today is a configured working day. The wrap-up nudge is gated on
  // this so an unfinished week can't nag on a Saturday/Sunday evening; the
  // Sunday plan-next-week nudge is deliberately exempt (planning for Monday on
  // Sunday evening is the point).
  isWorkingDay: boolean;
}

// The hour from which each nudge becomes due.
export const WRAP_UP_HOUR = 17;
export const PLAN_NEXT_WEEK_HOUR = 17;

const SUNDAY = 0;

export function selectNudge(input: NudgeInput): NudgeKind | null {
  // One per logical day, whichever kind it was.
  if (input.lastNudgedDay === input.logicalToday) return null;

  const hour = input.now.getHours();

  // The wrap-up state already means "last working day (or later) and the
  // end-of-week review is still outstanding". "Or later" spills onto the weekend,
  // so gate on today actually being a working day — Dave is never nudged to
  // review on a non-working day (the dashboard button may still offer it).
  if (input.action === 'wrap-up' && input.isWorkingDay && hour >= WRAP_UP_HOUR) return 'wrap-up';

  // The Sunday-evening reminder is only useful while next week is genuinely
  // unplanned; once it is planned the state machine moves on by itself.
  if (
    input.action === 'plan-next-week' &&
    !input.nextWeekPlanned &&
    input.now.getDay() === SUNDAY &&
    hour >= PLAN_NEXT_WEEK_HOUR
  ) {
    return 'plan-next-week';
  }

  return null;
}

export const NUDGE_CONTENT: Record<NudgeKind, { title: string; body: string }> = {
  'wrap-up': {
    title: 'Wrap up your week',
    body: 'Review what got done and carry the rest into next week.',
  },
  'plan-next-week': {
    title: 'Next week is unplanned',
    body: 'Plan it before Monday?',
  },
};
