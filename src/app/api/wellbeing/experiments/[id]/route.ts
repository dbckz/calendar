import { NextRequest, NextResponse } from 'next/server';

import { deleteExperiment, updateExperiment } from '@/lib/storage/wellbeing';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const experiment = await updateExperiment(id, {
      title: body.title,
      hypothesis: body.hypothesis,
      protocol: body.protocol,
      measure: body.measure,
      startDate: body.startDate,
      endDate: body.endDate,
      status: body.status,
      verdict: body.verdict,
      reflection: body.reflection,
    });
    if (!experiment) return NextResponse.json({ error: 'Experiment not found' }, { status: 404 });
    return NextResponse.json({ experiment });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update the experiment';
    console.error('Error updating experiment:', error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = await deleteExperiment(id);
    if (!deleted) return NextResponse.json({ error: 'Experiment not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting experiment:', error);
    return NextResponse.json({ error: 'Failed to delete the experiment' }, { status: 500 });
  }
}
