import { NextRequest, NextResponse } from 'next/server';

import { createExperiment, listExperiments } from '@/lib/storage/wellbeing';
import type { ExperimentStatus } from '@/types/wellbeing';

// GET /api/wellbeing/experiments?status= — newest first.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const experiments = await listExperiments(
      (searchParams.get('status') as ExperimentStatus | null) ?? undefined
    );
    return NextResponse.json({ experiments });
  } catch (error) {
    console.error('Error listing experiments:', error);
    return NextResponse.json({ error: 'Failed to load experiments' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const experiment = await createExperiment({
      title: body.title,
      hypothesis: body.hypothesis,
      protocol: body.protocol,
      measure: body.measure,
      startDate: body.startDate,
      endDate: body.endDate,
      status: body.status,
    });
    return NextResponse.json({ experiment });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create the experiment';
    console.error('Error creating experiment:', error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
