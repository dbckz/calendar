import { NextRequest, NextResponse } from 'next/server';
import {
  getTemplateGroups,
  addTemplateGroup,
  updateTemplateGroup,
  deleteTemplateGroup,
  reorderTemplateGroups,
} from '@/lib/user-data-storage';

// GET - Fetch all template groups
export async function GET() {
  try {
    const groups = await getTemplateGroups();
    return NextResponse.json({ groups });
  } catch (error) {
    console.error('Error fetching template groups:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch template groups' },
      { status: 500 }
    );
  }
}

// POST - Add a new template group
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const group = await addTemplateGroup(name);
    return NextResponse.json({ group });
  } catch (error) {
    console.error('Error adding template group:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add template group' },
      { status: 500 }
    );
  }
}

// PATCH - Update or reorder template groups
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    // Handle reorder request
    if (body.reorder && Array.isArray(body.groupIds)) {
      await reorderTemplateGroups(body.groupIds);
      const groups = await getTemplateGroups();
      return NextResponse.json({ groups });
    }

    // Handle single group update
    const { id, ...updates } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const group = await updateTemplateGroup(id, updates);

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    return NextResponse.json({ group });
  } catch (error) {
    console.error('Error updating template group:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update template group' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a template group
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const success = await deleteTemplateGroup(id);

    if (!success) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting template group:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete template group' },
      { status: 500 }
    );
  }
}
