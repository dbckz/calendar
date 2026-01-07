import { NextRequest, NextResponse } from 'next/server';
import {
  getAdHocTasks,
  addAdHocTask,
  updateAdHocTask,
  deleteAdHocTask,
} from '@/lib/user-data-storage';
import { TaskType } from '@/types';

// GET - Fetch all ad-hoc tasks
export async function GET() {
  try {
    const tasks = await getAdHocTasks();
    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('Error fetching ad-hoc tasks:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch ad-hoc tasks' },
      { status: 500 }
    );
  }
}

// POST - Add a new ad-hoc task
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description, dueDate, dueTime, duration, completed, priority, taskType, googleEventId, googleIntegrationId } = body;

    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    if (!priority || !['low', 'medium', 'high'].includes(priority)) {
      return NextResponse.json({ error: 'valid priority is required' }, { status: 400 });
    }

    if (!taskType || typeof taskType !== 'string') {
      return NextResponse.json({ error: 'taskType is required' }, { status: 400 });
    }

    const task = await addAdHocTask({
      title,
      description,
      dueDate,
      dueTime,
      duration,
      completed: completed ?? false,
      priority: priority as 'low' | 'medium' | 'high',
      taskType: taskType as TaskType,
      googleEventId,
      googleIntegrationId,
    });

    return NextResponse.json({ task });
  } catch (error) {
    console.error('Error adding ad-hoc task:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add ad-hoc task' },
      { status: 500 }
    );
  }
}

// PATCH - Update an existing ad-hoc task
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const task = await updateAdHocTask(id, updates);

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ task });
  } catch (error) {
    console.error('Error updating ad-hoc task:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update ad-hoc task' },
      { status: 500 }
    );
  }
}

// DELETE - Delete an ad-hoc task
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const success = await deleteAdHocTask(id);

    if (!success) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting ad-hoc task:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete ad-hoc task' },
      { status: 500 }
    );
  }
}
