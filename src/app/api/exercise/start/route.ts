import { NextRequest, NextResponse } from 'next/server';
import { format } from 'date-fns';

import { buildProgressions } from '@/lib/exercise-progression';
import { buildSessionTargets, type ExerciseTarget } from '@/lib/exercise-targets';
import { createSession, getAllSessions } from '@/lib/storage/exercise';

// POST /api/exercise/start { date? }
//
// The one button you press on arriving at the gym: opens today's session,
// pre-filled with what to aim for on each exercise.
//
// Idempotent — pressing it again returns the session already in progress rather
// than starting a second one, because the phone will get closed and reopened
// mid-workout.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const date = typeof body.date === 'string' ? body.date : format(new Date(), 'yyyy-MM-dd');

    const sessions = await getAllSessions();
    const inProgress = sessions.find(s => s.date === date && s.completed && s.source === 'manual');
    if (inProgress) return NextResponse.json({ session: inProgress, resumed: true });

    const plan = sessions.find(s => s.date === date && s.planned);
    // Exclude today so the seeded entries aim at progressing from the PREVIOUS
    // workout, not from a session logged earlier today.
    const targets = buildSessionTargets(
      buildProgressions(sessions, { before: date }),
      plan?.components ?? []
    );

    const session = await createSession({
      date,
      type: plan?.type ?? 'session',
      ...(plan?.label ? { label: plan.label } : {}),
      ...(plan?.components ? { components: plan.components } : {}),
      exercises: targets.map(toEntry),
      // The explicit link back to the plan this session is being done against.
      ...(plan ? { plannedSessionId: plan.id } : {}),
      planned: false,
      // Logged from the start: the session is being done now, and every tick
      // during it should land in the record immediately.
      completed: true,
      source: 'manual',
    });

    return NextResponse.json({ session, resumed: false, plan: plan?.label ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start the session';
    console.error('Error starting exercise session:', error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// Seed an entry from its target: the numbers to aim for are pre-filled as the
// numbers done, so a session that goes to plan needs only a tick per exercise.
function toEntry(target: ExerciseTarget) {
  return {
    name: target.name,
    ...(target.sets !== undefined ? { sets: target.sets } : {}),
    ...(target.reps !== undefined ? { reps: target.reps } : {}),
    ...(target.holdSeconds !== undefined ? { holdSeconds: target.holdSeconds } : {}),
    ...(target.weightKg !== undefined ? { weightKg: target.weightKg } : {}),
    targetText: describeTarget(target),
    done: false,
  };
}

function describeTarget(target: ExerciseTarget): string {
  const volume =
    target.sets && target.reps
      ? `${target.sets}×${target.reps}`
      : target.sets && target.holdSeconds
        ? `${target.sets}×${target.holdSeconds}s`
        : '';
  const load = target.weightKg !== undefined ? `${target.weightKg}kg` : '';
  return [volume, load].filter(Boolean).join(' · ');
}
