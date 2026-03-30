import { NextRequest, NextResponse } from 'next/server';
import {
  getGoogleTasksIntegration,
  getTasks,
  addTask,
  updateTask,
  deleteTask,
  GoogleTask,
} from '@/lib/google-tasks';

function toReminder(task: GoogleTask) {
  return {
    id: task.id,
    text: task.title,
    completed: task.status === 'completed',
    createdAt: task.updated,
  };
}

function errorResponse(action: string, error: unknown): NextResponse {
  console.error(`Error ${action} reminder:`, error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : `Failed to ${action} reminder` },
    { status: 500 },
  );
}

export async function GET() {
  try {
    const { credentials, integration } = await getGoogleTasksIntegration();
    const tasks = await getTasks(credentials, integration.clientId, integration.clientSecret);
    return NextResponse.json({ reminders: tasks.map(toReminder) });
  } catch (error) {
    return errorResponse('fetching', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }

    const { credentials, integration } = await getGoogleTasksIntegration();
    const task = await addTask(credentials, integration.clientId, integration.clientSecret, text.trim());
    return NextResponse.json({ reminder: toReminder(task) });
  } catch (error) {
    return errorResponse('adding', error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, completed, text } = await request.json();
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { credentials, integration } = await getGoogleTasksIntegration();

    const updates: { title?: string; status?: 'needsAction' | 'completed' } = {};
    if (typeof text === 'string') updates.title = text;
    if (typeof completed === 'boolean') updates.status = completed ? 'completed' : 'needsAction';

    const task = await updateTask(credentials, integration.clientId, integration.clientSecret, id, updates);
    return NextResponse.json({ reminder: toReminder(task) });
  } catch (error) {
    return errorResponse('updating', error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { credentials, integration } = await getGoogleTasksIntegration();
    await deleteTask(credentials, integration.clientId, integration.clientSecret, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse('deleting', error);
  }
}
