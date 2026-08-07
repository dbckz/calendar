// The progression plan: the milestones a goal ramps through, and the maths that
// turns them into an expected value at any instant.
//
// A goal's plan is a list of dated milestones inside its period. Pacing bends the
// straight line through them: instead of "target × fraction-elapsed", the
// expected figure follows the ramp the plan actually laid out — steeper here,
// flatter there — anchored at (period start, 0) and (period end, target).
//
// No React, no storage: pure functions over a Goal, so pacing, the inference
// validator and the UI all agree on what the plan means.

import { format, parse, isValid, startOfISOWeek } from 'date-fns';

import { periodRange } from './goal-periods';
import type { Goal, GoalMilestone, GoalPeriodKind } from '@/types/life';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_WEEK_KEY = /^\d{4}-W\d{2}$/;

// The instant a milestone key points at, or null when it isn't a key we know.
// A plain date is that day's midnight; an ISO week resolves to its Monday.
export function milestoneDate(key: string): Date | null {
  if (DATE_KEY.test(key)) {
    const d = parse(key, 'yyyy-MM-dd', new Date());
    return isValid(d) ? d : null;
  }
  if (ISO_WEEK_KEY.test(key)) {
    const [year, week] = key.split('-W');
    const d = startOfISOWeek(parse(`${year}-01-04`, 'yyyy-MM-dd', new Date()));
    // 4 Jan is always in ISO week 1; step forward whole weeks from there.
    d.setDate(d.getDate() + (Number(week) - 1) * 7);
    return isValid(d) ? d : null;
  }
  return null;
}

export function isValidMilestoneKey(key: string): boolean {
  return milestoneDate(key) !== null;
}

// "6 km by 15 Sep" — one milestone in a sentence, with the goal's unit and the
// milestone's date where its key parses. Shared by the pacing bar and the
// exercise programmer so a waypoint reads the same wherever it appears.
export function describeMilestone(milestone: GoalMilestone, unit?: string): string {
  const suffix = unit ? ` ${unit}` : '';
  const figure = milestone.value !== undefined ? `${milestone.value}${suffix}` : milestone.label;
  const at = milestoneDate(milestone.key);
  return at ? `${figure} by ${format(at, 'd MMM')}` : figure;
}

// Whether a key resolves to an instant inside a period. `end` is exclusive, so a
// milestone dated on the last day of the period counts and one dated on the
// first day of the next does not.
export function isMilestoneInPeriod(key: string, kind: GoalPeriodKind, periodKey: string): boolean {
  const at = milestoneDate(key);
  if (!at) return false;
  const { start, end } = periodRange(kind, periodKey);
  return at.getTime() >= start.getTime() && at.getTime() < end.getTime();
}

// Clean a raw milestone list into something safe to store and pace against.
// Tolerant, like the rest of goal storage: a malformed entry is dropped, not
// fatal. Entries are kept only when the key is a real in-period date and there is
// a label (synthesised from the value when the caller left it blank). The result
// is sorted by date and, where the caller passes a target, forced monotone toward
// it so the ramp never doubles back.
export function sanitizeMilestones(
  raw: unknown,
  opts: { periodKind: GoalPeriodKind; periodKey: string; target?: number; unit?: string } = {
    periodKind: 'month',
    periodKey: '',
  }
): GoalMilestone[] {
  if (!Array.isArray(raw)) return [];

  const cleaned: GoalMilestone[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const key = typeof e.key === 'string' ? e.key.trim() : '';
    if (!key) continue;
    if (opts.periodKey && !isMilestoneInPeriod(key, opts.periodKind, opts.periodKey)) continue;

    const value =
      typeof e.value === 'number' && Number.isFinite(e.value) ? e.value : undefined;
    // A blank label is synthesised from the figure ("6 km"); with neither a
    // label nor a figure there is nothing to show, so the entry is dropped.
    let label = typeof e.label === 'string' ? e.label.trim() : '';
    if (!label && value !== undefined) label = `${value}${opts.unit ? ` ${opts.unit}` : ''}`;
    if (!label) continue;

    const reasoning =
      typeof e.reasoning === 'string' && e.reasoning.trim() ? e.reasoning.trim() : undefined;

    cleaned.push({
      key,
      label,
      ...(value !== undefined ? { value } : {}),
      ...(reasoning ? { reasoning } : {}),
    });
  }

  // Every key here already parses (filtered above), so the times are real.
  cleaned.sort((a, b) => milestoneDate(a.key)!.getTime() - milestoneDate(b.key)!.getTime());
  return enforceMonotone(cleaned, opts.target);
}

// Drop milestones whose value moves the wrong way. Direction is set by the target
// relative to the first numeric milestone (a target above the first value ramps
// up, below it ramps down); with no target, the first two numeric values set the
// direction. A milestone with no value never blocks — it's a narrative checkpoint.
function enforceMonotone<T extends { value?: number }>(items: T[], target?: number): T[] {
  const valued = items.filter(m => typeof m.value === 'number');
  if (valued.length < 1) return items;

  const first = valued[0].value!;
  const reference = typeof target === 'number' ? target : valued[valued.length - 1].value!;
  const increasing = reference >= first;

  const out: T[] = [];
  let last: number | null = null;
  for (const item of items) {
    if (typeof item.value !== 'number') {
      out.push(item);
      continue;
    }
    if (last !== null && (increasing ? item.value < last : item.value > last)) continue;
    last = item.value;
    out.push(item);
  }
  return out;
}

// The numeric anchors of the expected curve, in time order:
//   (period start, 0) → each valued milestone → (period end, target)
// Used to interpolate the expected figure. Returns null when there is nothing to
// bend the line through, so the caller falls back to a straight line.
function planAnchors(goal: Goal): Array<{ t: number; v: number }> | null {
  const plan = goal.plan;
  if (!plan || plan.length === 0) return null;
  const target = goal.target?.value;
  const { start, end } = periodRange(goal.periodKind, goal.periodKey);

  const points: Array<{ t: number; v: number }> = [{ t: start.getTime(), v: 0 }];
  for (const m of plan) {
    if (typeof m.value !== 'number') continue;
    const at = milestoneDate(m.key);
    if (!at) continue;
    points.push({ t: at.getTime(), v: m.value });
  }
  // Just the (start,0) anchor means no real milestone to pace against.
  if (points.length < 2) return null;

  if (typeof target === 'number') points.push({ t: end.getTime(), v: target });
  points.sort((a, b) => a.t - b.t);
  return points;
}

// The expected value at `now` read off the milestone ramp, or null when the goal
// has no usable plan (the caller then paces on the straight line). Before the
// first anchor and after the last it holds flat at the nearest anchor's value,
// which is what makes before-first / after-last well-defined.
export function expectedFromPlan(goal: Goal, now: Date): number | null {
  const anchors = planAnchors(goal);
  if (!anchors) return null;

  const t = now.getTime();
  if (t <= anchors[0].t) return anchors[0].v;
  if (t >= anchors[anchors.length - 1].t) return anchors[anchors.length - 1].v;

  for (let i = 1; i < anchors.length; i++) {
    const prev = anchors[i - 1];
    const next = anchors[i];
    if (t <= next.t) {
      const span = next.t - prev.t;
      if (span <= 0) return next.v;
      const frac = (t - prev.t) / span;
      return prev.v + (next.v - prev.v) * frac;
    }
  }
  return anchors[anchors.length - 1].v;
}

// The next milestone still ahead of `now` (the first whose date is on or after
// now), or null when the plan is empty or fully behind us. This is what the
// nudge and pacing copy point at.
export function nextMilestone(goal: Goal, now: Date): GoalMilestone | null {
  if (!goal.plan || goal.plan.length === 0) return null;
  const t = now.getTime();
  const upcoming = goal.plan
    .map(m => ({ m, at: milestoneDate(m.key)?.getTime() ?? Infinity }))
    .filter(x => Number.isFinite(x.at) && x.at >= t)
    .sort((a, b) => a.at - b.at);
  return upcoming[0]?.m ?? null;
}
