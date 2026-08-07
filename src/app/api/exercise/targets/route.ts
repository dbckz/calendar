import { NextRequest, NextResponse } from 'next/server';
import { format } from 'date-fns';

import { buildProgressions } from '@/lib/exercise-progression';
import { buildSessionTargets } from '@/lib/exercise-targets';
import {
  buildProgrammerInput,
  generateProgramme,
  programmeHash,
  programmeRowToTarget,
  type ProgrammerGoal,
  type ProgrammerInput,
} from '@/lib/exercise-programmer';
import { getCachedProgramme, saveCachedProgramme } from '@/lib/storage/exercise-programmes';
import { getAllSessions } from '@/lib/storage/exercise';
import { queryGoals } from '@/lib/storage/goals';
import { resolveEvidenceForGoals } from '@/lib/goal-evidence';
import { computeProgress } from '@/lib/goal-progress';
import { describeMilestone } from '@/lib/goal-plan';
import type { Goal, GoalProgress } from '@/types/life';

// GET /api/exercise/targets?date=yyyy-MM-dd
//
// What to aim for in a session, for each exercise. Two sources, one shape:
//
//   'ai'       — a Claude-programmed session (ordered, core/rotation/cardio
//                tagged, one exercise to failure), cached per day-plan.
//   'fallback' — the instant rule-based targets, served while the AI programme
//                is being generated (or when Claude is unavailable).
//
// When the AI programme isn't cached yet, generation is kicked off in the
// background and the fallback is returned with generating:true; the client
// refetches to pick up the programme once it lands.

// In-flight generations, keyed by date+hash, so overlapping loads (or a client
// poll firing before the first finished) never spawn two Claude calls for the
// same plan. Per-process — a best-effort guard, not a distributed lock.
const inFlight = new Set<string>();

function kickOffGeneration(date: string, hash: string, input: ProgrammerInput): void {
  const key = `${date}:${hash}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  // Fire-and-forget: the response has already gone; the long-running server
  // finishes this and caches the result for the client's next fetch.
  void generateProgramme(input)
    .then(rows => {
      if (rows) saveCachedProgramme(date, hash, rows);
    })
    .catch(error => {
      console.error('Background exercise programme generation failed:', error);
    })
    .finally(() => {
      inFlight.delete(key);
    });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || format(new Date(), 'yyyy-MM-dd');

    const sessions = await getAllSessions();
    const plan = sessions.find(s => s.date === date && s.planned);
    const components = plan?.components ?? [];
    // Exclude the target date so "last time" is the previous workout, not a
    // session already logged today.
    const progressions = buildProgressions(sessions, { before: date });
    const totalSessions = sessions.filter(
      s => s.completed && s.exercises?.length && s.date < date
    ).length;

    const planPayload = plan ? { plan: { label: plan.label, components } } : {};

    // Active exercise goals, so the programme graduates toward them (a run-distance
    // ramp sets the run target, a strength goal justifies pushing a lift).
    const goals = await buildProgrammerGoals(date);

    // The AI programme reasons over the same plan, history and goals every time;
    // its hash decides whether a cached programme still applies.
    const input = buildProgrammerInput(
      progressions,
      { label: plan?.label, components },
      date,
      totalSessions,
      goals
    );
    const hash = programmeHash(input);
    const cached = getCachedProgramme(date, hash);

    if (cached) {
      return NextResponse.json({
        date,
        ...planPayload,
        targets: cached.map(programmeRowToTarget),
        source: 'ai',
        generating: false,
      });
    }

    // No programme yet: serve the instant rule-based targets and, when there is
    // history to program from, generate the AI version in the background.
    const targets = buildSessionTargets(progressions, components);
    const generating = input.exercises.length > 0;
    if (generating) kickOffGeneration(date, hash, input);

    return NextResponse.json({
      date,
      ...planPayload,
      targets,
      source: 'fallback',
      generating,
    });
  } catch (error) {
    console.error('Error building exercise targets:', error);
    return NextResponse.json({ error: 'Failed to build targets' }, { status: 500 });
  }
}

// The active Exercise-section goals, each resolved to its current pace and next
// milestone, as the compact shape the programmer reasons over. Best-effort: a
// failure here (evidence source down) must never stop the session's targets, so
// it degrades to no goals.
async function buildProgrammerGoals(date: string): Promise<ProgrammerGoal[]> {
  try {
    const goals = await queryGoals({ sectionId: 'exercise', status: 'active' });
    if (goals.length === 0) return [];
    const now = new Date(`${date}T12:00:00`);
    const evidence = await resolveEvidenceForGoals(goals);
    return goals.map(goal => toProgrammerGoal(goal, computeProgress(goal, evidence[goal.id], now)));
  } catch (error) {
    console.error('Failed to load exercise goals for the programmer:', error);
    return [];
  }
}

function toProgrammerGoal(goal: Goal, progress: GoalProgress): ProgrammerGoal {
  const unit = goal.target?.unit ? ` ${goal.target.unit}` : '';
  const nextMilestone = progress.nextMilestone
    ? describeMilestone(progress.nextMilestone, goal.target?.unit)
    : undefined;
  return {
    title: goal.title,
    ...(goal.target ? { target: `${goal.target.value}${unit}` } : {}),
    ...(nextMilestone ? { nextMilestone } : {}),
    ...(progress.pace !== 'no-target' && progress.pace !== 'no-data' ? { pace: progress.pace } : {}),
  };
}
