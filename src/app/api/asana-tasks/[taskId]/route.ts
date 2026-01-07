import { NextRequest, NextResponse } from 'next/server';
import { completeTask, addTaskComment, deleteTask, refreshAsanaToken } from '@/lib/asana';
import { getIntegrationById, updateIntegration } from '@/lib/integration-storage';
import { AsanaIntegration } from '@/types';

// PATCH - Mark task complete/incomplete
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const { completed, integrationId } = await request.json();

    if (typeof completed !== 'boolean') {
      return NextResponse.json({ error: 'completed must be a boolean' }, { status: 400 });
    }

    if (!integrationId) {
      return NextResponse.json({ error: 'integrationId is required' }, { status: 400 });
    }

    const integration = await getIntegrationById(integrationId) as AsanaIntegration | null;
    if (!integration || integration.type !== 'asana') {
      return NextResponse.json({ error: 'Asana integration not found' }, { status: 404 });
    }

    if (!integration.credentials) {
      return NextResponse.json({ error: 'Integration not authenticated' }, { status: 401 });
    }

    let credentials = integration.credentials;

    // Check if token needs refresh
    if (credentials.expiresAt && Date.now() >= credentials.expiresAt - 60000) {
      credentials = await refreshAsanaToken(
        credentials.refreshToken!,
        integration.clientId,
        integration.clientSecret
      );
      await updateIntegration(integration.id, { credentials });
    }

    await completeTask(credentials.accessToken, taskId, completed);

    return NextResponse.json({ success: true, completed });
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update task' },
      { status: 500 }
    );
  }
}

// POST - Add comment to task
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const { comment, integrationId } = await request.json();

    if (!comment || typeof comment !== 'string') {
      return NextResponse.json({ error: 'comment must be a non-empty string' }, { status: 400 });
    }

    if (!integrationId) {
      return NextResponse.json({ error: 'integrationId is required' }, { status: 400 });
    }

    const integration = await getIntegrationById(integrationId) as AsanaIntegration | null;
    if (!integration || integration.type !== 'asana') {
      return NextResponse.json({ error: 'Asana integration not found' }, { status: 404 });
    }

    if (!integration.credentials) {
      return NextResponse.json({ error: 'Integration not authenticated' }, { status: 401 });
    }

    let credentials = integration.credentials;

    // Check if token needs refresh
    if (credentials.expiresAt && Date.now() >= credentials.expiresAt - 60000) {
      credentials = await refreshAsanaToken(
        credentials.refreshToken!,
        integration.clientId,
        integration.clientSecret
      );
      await updateIntegration(integration.id, { credentials });
    }

    await addTaskComment(credentials.accessToken, taskId, comment);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error adding comment:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add comment' },
      { status: 500 }
    );
  }
}

// DELETE - Delete task from Asana
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const { integrationId } = await request.json();

    if (!integrationId) {
      return NextResponse.json({ error: 'integrationId is required' }, { status: 400 });
    }

    const integration = await getIntegrationById(integrationId) as AsanaIntegration | null;
    if (!integration || integration.type !== 'asana') {
      return NextResponse.json({ error: 'Asana integration not found' }, { status: 404 });
    }

    if (!integration.credentials) {
      return NextResponse.json({ error: 'Integration not authenticated' }, { status: 401 });
    }

    let credentials = integration.credentials;

    // Check if token needs refresh
    if (credentials.expiresAt && Date.now() >= credentials.expiresAt - 60000) {
      credentials = await refreshAsanaToken(
        credentials.refreshToken!,
        integration.clientId,
        integration.clientSecret
      );
      await updateIntegration(integration.id, { credentials });
    }

    await deleteTask(credentials.accessToken, taskId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting task:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete task' },
      { status: 500 }
    );
  }
}
