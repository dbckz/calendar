// Pacing, scorecards and the mid-period nudge.
//
// Pacing compares what a goal has actually achieved against a straight line
// through the period. A linear expectation is crude — real work is lumpy — but
// it is honest about one thing that matters: at 70% through the month with 20%
// of the target done, something needs to change. The pace bands are deliberately
// forgiving so an ordinary week doesn't read as failure.

import { isPeriodOver, periodElapsed } from './goal-periods';
import { expectedFromPlan, nextMilestone } from './goal-plan';
import type {
  Goal,
  GoalPace,
  GoalProgress,
  GoalWithProgress,
  Scorecard,
  ScorecardRow,
  ScorecardVerdict,
} from '@/types/life';
import type { ResolvedEvidence } from './goal-evidence';

// How far behind the straight line a goal may drift before it reads 'behind'.
// 15% of the target, so a monthly goal can lose about four and a half days.
const BEHIND_TOLERANCE = 0.15;
// The mirror band above the line for 'ahead'.
const AHEAD_TOLERANCE = 0.15;

export function computeProgress(
  goal: Goal,
  evidence: ResolvedEvidence,
  now: Date = new Date()
): GoalProgress {
  const elapsed = periodElapsed(goal.periodKind, goal.periodKey, now);
  const target = goal.target?.value ?? null;
  const actual = evidence.actual;
  const lastCheckIn = goal.checkIns.at(-1);

  // Where the goal should be by now. A goal with a progression plan is paced
  // against the milestone ramp; without one it falls back to the straight line.
  const planned = expectedFromPlan(goal, now);
  let expected: number | null = null;
  if (planned !== null) expected = round1(planned);
  else if (target !== null) expected = round1(target * elapsed);
  const completion = target !== null && target > 0 && actual !== null ? actual / target : null;
  // The fraction the pace bands compare against: the plan's expected share of the
  // target where a plan exists, otherwise plain elapsed time.
  const expectedFraction =
    target !== null && target > 0 && expected !== null ? expected / target : elapsed;
  const upcoming = nextMilestone(goal, now);

  return {
    goalId: goal.id,
    periodElapsed: elapsed,
    expected,
    actual,
    completion,
    pace: derivePace(target, actual, expectedFraction, completion),
    evidenceLabel: evidence.label,
    // A goal with no evidence AND no check-in is invisible progress-wise; that
    // is exactly what the nudge should surface. An actual of 0 counts as no
    // evidence too — nothing has happened.
    noEvidence: !actual && goal.checkIns.length === 0,
    ...(lastCheckIn ? { lastCheckIn } : {}),
    ...(upcoming ? { nextMilestone: upcoming } : {}),
  };
}

// `expectedFraction` is where the goal should be as a share of its target: plain
// elapsed time for a straight-line goal, the milestone ramp's height for a
// planned one. The tolerance bands are applied around it either way.
function derivePace(
  target: number | null,
  actual: number | null,
  expectedFraction: number,
  completion: number | null
): GoalPace {
  if (target === null) return 'no-target';
  if (actual === null) return 'no-data';
  if (completion === null) return 'no-data';
  // A finished goal is never 'behind', however early in the period it landed.
  if (completion >= 1) return 'ahead';
  if (completion >= expectedFraction + AHEAD_TOLERANCE) return 'ahead';
  if (completion < expectedFraction - BEHIND_TOLERANCE) return 'behind';
  return 'on-track';
}

// ---------------------------------------------------------------------------
// Mid-period nudge
// ---------------------------------------------------------------------------

// Point in a period past which a goal showing nothing is worth flagging. Just
// past halfway, so it lands around the 15th of a month.
const NUDGE_THRESHOLD = 0.5;

export interface GoalNudge {
  goal: Goal;
  progress: GoalProgress;
  reason: 'no-evidence' | 'behind' | 'stalled';
}

// Goals worth interrupting Dave about, worst first. Only fires past the halfway
// mark: flagging a quiet first week would train him to ignore the card.
export function buildNudges(items: GoalWithProgress[]): GoalNudge[] {
  const nudges: GoalNudge[] = [];

  for (const { goal, progress } of items) {
    if (goal.status !== 'active') continue;
    if (progress.periodElapsed < NUDGE_THRESHOLD) continue;

    if (progress.lastCheckIn?.status === 'stalled') {
      nudges.push({ goal, progress, reason: 'stalled' });
    } else if (progress.noEvidence) {
      nudges.push({ goal, progress, reason: 'no-evidence' });
    } else if (progress.pace === 'behind') {
      nudges.push({ goal, progress, reason: 'behind' });
    }
  }

  const severity: Record<GoalNudge['reason'], number> = { stalled: 0, 'no-evidence': 1, behind: 2 };
  return nudges.sort(
    (a, b) =>
      severity[a.reason] - severity[b.reason] ||
      (a.progress.completion ?? 0) - (b.progress.completion ?? 0)
  );
}

// ---------------------------------------------------------------------------
// Scorecard
// ---------------------------------------------------------------------------

// What the evidence says the outcome was. The reflection session presents this
// as a default and lets Dave overrule it — a goal can be missed on the numbers
// and still have been the right call.
export function suggestVerdict(goal: Goal, progress: GoalProgress): ScorecardVerdict {
  if (goal.status === 'dropped') return 'dropped';
  // A verdict already recorded in a reflection wins over re-deriving it.
  if (goal.status === 'hit' || goal.status === 'partial' || goal.status === 'missed') {
    return goal.status;
  }
  if (progress.completion === null) {
    // No target: fall back to the last check-in, which is all the signal there is.
    if (!progress.lastCheckIn) return 'unknown';
    return progress.lastCheckIn.status === 'on-track' ? 'hit' : 'partial';
  }
  if (progress.completion >= 1) return 'hit';
  if (progress.completion >= 0.5) return 'partial';
  return 'missed';
}

export function buildScorecard(
  periodKind: Goal['periodKind'],
  periodKey: string,
  items: GoalWithProgress[]
): Scorecard {
  const rows: ScorecardRow[] = items.map(({ goal, progress }) => ({
    goal,
    progress,
    suggestedVerdict: suggestVerdict(goal, progress),
  }));

  const count = (v: ScorecardVerdict) => rows.filter(r => r.suggestedVerdict === v).length;
  const hit = count('hit');
  const partial = count('partial');
  const missed = count('missed');

  return {
    periodKind,
    periodKey,
    rows,
    hit,
    partial,
    missed,
    dropped: count('dropped'),
    // Dropped and unknown goals are excluded: a hit rate is only meaningful over
    // goals that were actually being pursued and can be judged.
    scored: hit + partial + missed,
  };
}

// A period is ready to be reflected on once it has ended. Offered early too —
// reflecting on the last few days of a month before it closes is normal — so
// this only drives the default, never a hard gate.
export function isReflectionDue(
  periodKind: Goal['periodKind'],
  periodKey: string,
  now: Date = new Date()
): boolean {
  return isPeriodOver(periodKind, periodKey, now);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
