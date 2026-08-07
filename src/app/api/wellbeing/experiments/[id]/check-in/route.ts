import { NextRequest, NextResponse } from 'next/server';

import { addExperimentCheckIn } from '@/lib/storage/wellbeing';

// POST /api/wellbeing/experiments/:id/check-in — one observation while the
// experiment runs. Checking in on a planned experiment starts it.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const experiment = await addExperimentCheckIn(id, {
      rating: typeof body.rating === 'number' ? body.rating : undefined,
      note: body.note,
    });
    if (!experiment) return NextResponse.json({ error: 'Experiment not found' }, { status: 404 });
    return NextResponse.json({ experiment });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to record the check-in';
    console.error('Error recording experiment check-in:', error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
