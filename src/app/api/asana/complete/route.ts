import { NextRequest, NextResponse } from 'next/server';

import { completeTask, refreshAsanaToken } from '@/lib/asana';
import { getIntegrationById, updateIntegration } from '@/lib/integration-storage';
import { AsanaIntegration } from '@/types';

// POST { gid, integrationId }
// Mark an Asana task complete. Used by the "Plan my week" wizard's per-task
// "done" control so a task can be cleared without leaving the planner. Uses the
// same token-refresh pattern as the rest of the Asana integration.
export async function POST(request: NextRequest) {
  try {
    const { gid, integrationId } = await request.json();

    if (typeof gid !== 'string' || !gid) {
      return NextResponse.json({ error: 'gid is required' }, { status: 400 });
    }
    if (typeof integrationId !== 'string' || !integrationId) {
      return NextResponse.json({ error: 'integrationId is required' }, { status: 400 });
    }

    const integration = (await getIntegrationById(integrationId)) as AsanaIntegration | null;
    if (!integration || integration.type !== 'asana') {
      return NextResponse.json({ error: 'Asana integration not found' }, { status: 404 });
    }
    if (!integration.credentials) {
      return NextResponse.json({ error: 'Integration not authenticated' }, { status: 401 });
    }

    let credentials = integration.credentials;
    if (credentials.expiresAt && Date.now() >= credentials.expiresAt - 60000) {
      credentials = await refreshAsanaToken(
        credentials.refreshToken!,
        integration.clientId,
        integration.clientSecret
      );
      await updateIntegration(integration.id, { credentials });
    }

    await completeTask(credentials.accessToken, gid, true);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error completing Asana task:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to complete task' },
      { status: 500 }
    );
  }
}
