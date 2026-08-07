import { NextRequest, NextResponse } from 'next/server';

import { deleteGoal, updateGoal } from '@/lib/storage/goals';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const goal = await updateGoal(id, {
      title: body.title,
      detail: body.detail,
      target: body.target,
      evidence: body.evidence,
      status: body.status,
      reflection: body.reflection,
      manualValue: body.manualValue,
      parentGoalId: body.parentGoalId,
      plan: body.plan,
      planSource: body.planSource,
    });
    if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    return NextResponse.json({ goal });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update goal';
    console.error('Error updating goal:', error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = await deleteGoal(id);
    if (!deleted) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting goal:', error);
    return NextResponse.json({ error: 'Failed to delete goal' }, { status: 500 });
  }
}
