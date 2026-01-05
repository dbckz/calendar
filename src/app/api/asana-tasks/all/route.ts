import { NextResponse } from 'next/server';
import { getIncompleteTasks, asanaTaskToCalendarEvent, refreshAsanaToken } from '@/lib/asana';
import { getEnabledAsanaIntegrations, updateIntegration } from '@/lib/integration-storage';
import { CalendarEvent, AsanaIntegration } from '@/types';

export async function GET() {
  try {
    const integrations = await getEnabledAsanaIntegrations();
    console.log('[Asana Tasks API] Enabled integrations:', integrations.map(i => ({
      id: i.id,
      name: i.name,
      workspaceId: i.workspaceId,
      hasCredentials: !!i.credentials,
    })));

    if (integrations.length === 0) {
      return NextResponse.json([]);
    }

    const allEvents: CalendarEvent[] = [];

    // Fetch tasks from all enabled integrations
    for (const integration of integrations) {
      try {
        console.log(`[Asana Tasks API] Fetching from "${integration.name}" (workspace: ${integration.workspaceId})`);
        const events = await fetchTasksFromIntegration(integration);
        console.log(`[Asana Tasks API] Got ${events.length} tasks from "${integration.name}"`);
        allEvents.push(...events);
      } catch (error) {
        console.error(`Error fetching from integration ${integration.name}:`, error);
        // Continue with other integrations even if one fails
      }
    }

    // Sort by due date (tasks without due date go to the end)
    allEvents.sort((a, b) => {
      if (!a.dueOn && !b.dueOn) return 0;
      if (!a.dueOn) return 1;
      if (!b.dueOn) return -1;
      return a.dueOn.localeCompare(b.dueOn);
    });

    return NextResponse.json(allEvents);
  } catch (error) {
    console.error('Error fetching all Asana tasks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Asana tasks' },
      { status: 500 }
    );
  }
}

async function fetchTasksFromIntegration(
  integration: AsanaIntegration
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

  const tasks = await getIncompleteTasks(
    credentials.accessToken,
    integration.workspaceId
  );

  const events = tasks.map(asanaTaskToCalendarEvent);

  // Add integration metadata to each event
  return events.map(event => ({
    ...event,
    integrationId: integration.id,
    integrationName: integration.name,
  }));
}
