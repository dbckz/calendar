import { NextRequest, NextResponse } from 'next/server';
import { getTasksForDate, asanaTaskToCalendarEvent, refreshAsanaToken, createTask, CreateTaskParams } from '@/lib/asana';
import { getEnabledAsanaIntegrations, updateIntegration, getIntegrationById } from '@/lib/integration-storage';
import { CalendarEvent, AsanaIntegration } from '@/types';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const dateStr = searchParams.get('date');

  if (!dateStr) {
    return NextResponse.json({ error: 'Date parameter is required' }, { status: 400 });
  }

  try {
    const integrations = await getEnabledAsanaIntegrations();

    if (integrations.length === 0) {
      return NextResponse.json([]);
    }

    const allEvents: CalendarEvent[] = [];

    // Fetch tasks from all enabled integrations
    for (const integration of integrations) {
      try {
        const events = await fetchTasksFromIntegration(integration, dateStr);
        allEvents.push(...events);
      } catch (error) {
        console.error(`Error fetching from integration ${integration.name}:`, error);
        // Continue with other integrations even if one fails
      }
    }

    // Sort all events by start time
    allEvents.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    return NextResponse.json(allEvents);
  } catch (error) {
    console.error('Error fetching Asana tasks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Asana tasks' },
      { status: 500 }
    );
  }
}

async function fetchTasksFromIntegration(
  integration: AsanaIntegration,
  dateStr: string
): Promise<CalendarEvent[]> {
  if (!integration.credentials || !integration.workspaceId) {
    return [];
  }

  let credentials = integration.credentials;

  // Check if token needs refresh
  if (credentials.expiresAt && Date.now() >= credentials.expiresAt - 60000) {
    credentials = await refreshAsanaToken(
      credentials.refreshToken!,
      integration.clientId,
      integration.clientSecret
    );

    // Update stored credentials
    await updateIntegration(integration.id, { credentials });
  }

  const tasks = await getTasksForDate(
    credentials.accessToken,
    integration.workspaceId,
    dateStr
  );

  const events = tasks.map(asanaTaskToCalendarEvent);

  // Add integration metadata to each event
  return events.map(event => ({
    ...event,
    integrationId: integration.id,
    integrationName: integration.name,
  }));
}

// Create a new Asana task
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { integrationId, name, notes, dueOn, projectGid, customFields } = body;

    if (!integrationId) {
      return NextResponse.json({ error: 'integrationId is required' }, { status: 400 });
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const integration = await getIntegrationById(integrationId);

    if (!integration || integration.type !== 'asana') {
      return NextResponse.json({ error: 'Invalid Asana integration' }, { status: 400 });
    }

    // Type assertion after checking type
    const asanaIntegration = integration as AsanaIntegration;

    if (!asanaIntegration.credentials || !asanaIntegration.workspaceId) {
      return NextResponse.json({ error: 'Integration not properly configured' }, { status: 400 });
    }

    let credentials = asanaIntegration.credentials;

    // Check if token needs refresh
    if (credentials.expiresAt && Date.now() >= credentials.expiresAt - 60000) {
      credentials = await refreshAsanaToken(
        credentials.refreshToken!,
        asanaIntegration.clientId,
        asanaIntegration.clientSecret
      );
      await updateIntegration(asanaIntegration.id, { credentials });
    }

    const taskParams: CreateTaskParams = {
      name: name.trim(),
    };

    if (notes && typeof notes === 'string') {
      taskParams.notes = notes;
    }

    if (dueOn && typeof dueOn === 'string') {
      taskParams.dueOn = dueOn;
    }

    if (projectGid && typeof projectGid === 'string') {
      taskParams.projectGid = projectGid;
    }

    if (customFields && typeof customFields === 'object') {
      taskParams.customFields = customFields;
    }

    const task = await createTask(
      credentials.accessToken,
      asanaIntegration.workspaceId,
      taskParams
    );

    // Convert to calendar event format for consistency
    const event = asanaTaskToCalendarEvent(task);

    return NextResponse.json({
      success: true,
      task: {
        ...event,
        integrationId: asanaIntegration.id,
        integrationName: asanaIntegration.name,
      },
    });
  } catch (error) {
    console.error('Error creating Asana task:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create task' },
      { status: 500 }
    );
  }
}
