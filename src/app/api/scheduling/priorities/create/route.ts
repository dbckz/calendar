import { NextRequest, NextResponse } from 'next/server';

import { getEnabledAsanaIntegrations, updateIntegration } from '@/lib/integration-storage';
import { createTask, refreshAsanaToken } from '@/lib/asana';
import type { AsanaIntegration } from '@/types';

interface CreateItem {
  text: string;
  integrationId: string;
}

// POST { items: [{ text, integrationId }] }
// Create one Asana task per unmatched priority. The wizard calls this once per
// step-1 confirm and remembers created gids, so Back/Next never re-creates.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const items: CreateItem[] = Array.isArray(body?.items)
      ? body.items.filter(
          (i: unknown): i is CreateItem =>
            !!i && typeof (i as CreateItem).text === 'string' && typeof (i as CreateItem).integrationId === 'string'
        )
      : [];

    if (items.length === 0) {
      return NextResponse.json({ created: [], errors: [] });
    }

    const integrations = await getEnabledAsanaIntegrations();
    const byId = new Map(integrations.map(i => [i.id, i]));

    // Refresh each integration's token at most once for this batch.
    const credentialsCache = new Map<string, string>();
    async function accessTokenFor(integration: AsanaIntegration): Promise<string> {
      const cached = credentialsCache.get(integration.id);
      if (cached) return cached;
      let credentials = integration.credentials!;
      if (credentials.expiresAt && Date.now() >= credentials.expiresAt - 60000) {
        credentials = await refreshAsanaToken(
          credentials.refreshToken!,
          integration.clientId,
          integration.clientSecret
        );
        await updateIntegration(integration.id, { credentials });
      }
      credentialsCache.set(integration.id, credentials.accessToken);
      return credentials.accessToken;
    }

    const created: Array<{ text: string; gid: string; title: string; integrationId: string }> = [];
    const errors: Array<{ text: string; error: string }> = [];

    for (const item of items) {
      try {
        const integration = byId.get(item.integrationId);
        if (!integration || !integration.credentials || !integration.workspaceId) {
          throw new Error('Asana integration not available');
        }
        const accessToken = await accessTokenFor(integration);
        const task = await createTask(accessToken, integration.workspaceId, { name: item.text });
        created.push({ text: item.text, gid: task.gid, title: task.name, integrationId: item.integrationId });
      } catch (err) {
        errors.push({ text: item.text, error: err instanceof Error ? err.message : 'Failed to create task' });
      }
    }

    return NextResponse.json({ created, errors });
  } catch (error) {
    console.error('Error creating priority tasks:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create priority tasks' },
      { status: 500 }
    );
  }
}
