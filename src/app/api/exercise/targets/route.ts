import { NextRequest, NextResponse } from 'next/server';
import { format } from 'date-fns';

import { buildProgressions } from '@/lib/exercise-progression';
import { buildSessionTargets } from '@/lib/exercise-targets';
import { getAllSessions } from '@/lib/storage/exercise';

// GET /api/exercise/targets?date=yyyy-MM-dd
//
// What to aim for in a session: for each exercise, the weight/reps to try next,
// derived from the last time it was trained and how that felt.
//
// When a session is planned for the date, its components ("Push (chest &
// arms)") narrow the list to the relevant exercises, so a push day doesn't
// suggest leg work.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || format(new Date(), 'yyyy-MM-dd');

    const sessions = await getAllSessions();
    const plan = sessions.find(s => s.date === date && s.planned);
    const targets = buildSessionTargets(buildProgressions(sessions), plan?.components ?? []);

    return NextResponse.json({
      date,
      ...(plan ? { plan: { label: plan.label, components: plan.components ?? [] } } : {}),
      targets,
    });
  } catch (error) {
    console.error('Error building exercise targets:', error);
    return NextResponse.json({ error: 'Failed to build targets' }, { status: 500 });
  }
}
