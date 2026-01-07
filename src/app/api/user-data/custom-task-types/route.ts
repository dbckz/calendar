import { NextRequest, NextResponse } from 'next/server';
import {
  getCustomTaskTypes,
  addCustomTaskType,
  deleteCustomTaskType,
} from '@/lib/user-data-storage';

// GET - Fetch all custom task types
export async function GET() {
  try {
    const customTypes = await getCustomTaskTypes();
    return NextResponse.json({ customTypes });
  } catch (error) {
    console.error('Error fetching custom task types:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch custom task types' },
      { status: 500 }
    );
  }
}

// POST - Add a new custom task type
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { label, emoji } = body;

    if (!label || typeof label !== 'string') {
      return NextResponse.json({ error: 'label is required' }, { status: 400 });
    }

    if (!emoji || typeof emoji !== 'string') {
      return NextResponse.json({ error: 'emoji is required' }, { status: 400 });
    }

    const customType = await addCustomTaskType({ label, emoji });

    return NextResponse.json({ customType });
  } catch (error) {
    console.error('Error adding custom task type:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add custom task type' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a custom task type
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const success = await deleteCustomTaskType(id);

    if (!success) {
      return NextResponse.json({ error: 'Custom task type not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting custom task type:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete custom task type' },
      { status: 500 }
    );
  }
}
