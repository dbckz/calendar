import { NextRequest, NextResponse } from 'next/server';
import { completeTask, addTaskComment, deleteTask, getTaskStories, refreshAsanaToken, updateTask, asanaTaskToCalendarEvent, UpdateTaskParams } from '@/lib/asana';
import { getIntegrationById, updateIntegration } from '@/lib/integration-storage';
import { AsanaIntegration } from '@/types';

// GET - Fetch task stories/comments
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const { searchParams } = new URL(request.url);
    const integrationId = searchParams.get('integrationId');

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

    const stories = await getTaskStories(credentials.accessToken, taskId);

    return NextResponse.json({ stories });
  } catch (error) {
    console.error('Error fetching stories:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch stories' },
      { status: 500 }
    );
  }
}

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

// PUT - Update task fields (due date, start date, type, projects, etc.)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const body = await request.json();
    const { integrationId, ...updateParams } = body;

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

    // Build update params
    const asanaUpdateParams: UpdateTaskParams = {};

    if (updateParams.dueOn !== undefined) {
      asanaUpdateParams.dueOn = updateParams.dueOn;
    }

    if (updateParams.startOn !== undefined) {
      asanaUpdateParams.startOn = updateParams.startOn;
    }

    if (updateParams.customFields !== undefined) {
      asanaUpdateParams.customFields = updateParams.customFields;
    }

    if (updateParams.addProjects !== undefined) {
      asanaUpdateParams.addProjects = updateParams.addProjects;
    }

    if (updateParams.removeProjects !== undefined) {
      asanaUpdateParams.removeProjects = updateParams.removeProjects;
    }

    if (updateParams.addTags !== undefined) {
      asanaUpdateParams.addTags = updateParams.addTags;
    }

    if (updateParams.removeTags !== undefined) {
      asanaUpdateParams.removeTags = updateParams.removeTags;
    }

    const updatedTask = await updateTask(credentials.accessToken, taskId, asanaUpdateParams);
    const event = asanaTaskToCalendarEvent(updatedTask);

    return NextResponse.json({
      success: true,
      task: {
        ...event,
        integrationId: integration.id,
        integrationName: integration.name,
      },
    });
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update task' },
      { status: 500 }
    );
  }
}
