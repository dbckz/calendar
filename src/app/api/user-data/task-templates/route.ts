import { NextRequest, NextResponse } from 'next/server';
import {
  getTaskTemplates,
  addTaskTemplate,
  updateTaskTemplate,
  deleteTaskTemplate,
} from '@/lib/user-data-storage';
import { TaskType } from '@/types';

// GET - Fetch all task templates
export async function GET() {
  try {
    const templates = await getTaskTemplates();
    return NextResponse.json({ templates });
  } catch (error) {
    console.error('Error fetching task templates:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch task templates' },
      { status: 500 }
    );
  }
}

// POST - Add a new task template
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description, duration, priority, taskType } = body;

    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    if (!duration || typeof duration !== 'number') {
      return NextResponse.json({ error: 'duration is required' }, { status: 400 });
    }

    if (!priority || !['low', 'medium', 'high'].includes(priority)) {
      return NextResponse.json({ error: 'valid priority is required' }, { status: 400 });
    }

    if (!taskType || typeof taskType !== 'string') {
      return NextResponse.json({ error: 'taskType is required' }, { status: 400 });
    }

    const template = await addTaskTemplate({
      title,
      description,
      duration,
      priority: priority as 'low' | 'medium' | 'high',
      taskType: taskType as TaskType,
    });

    return NextResponse.json({ template });
  } catch (error) {
    console.error('Error adding task template:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add task template' },
      { status: 500 }
    );
  }
}

// PATCH - Update an existing task template
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const template = await updateTaskTemplate(id, updates);

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error('Error updating task template:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update task template' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a task template
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const success = await deleteTaskTemplate(id);

    if (!success) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting task template:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete task template' },
      { status: 500 }
    );
  }
}
