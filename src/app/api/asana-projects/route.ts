import { NextResponse } from 'next/server';
import { getProjects, refreshAsanaToken } from '@/lib/asana';
import { getIntegrations, updateIntegration } from '@/lib/integration-storage';
import { AsanaIntegration, AsanaProject } from '@/types';

export async function GET() {
  try {
    const integrations = await getIntegrations();
    const asanaIntegrations = integrations.asanaIntegrations.filter(
      (i): i is AsanaIntegration & { credentials: NonNullable<AsanaIntegration['credentials']>; workspaceId: string } =>
        i.enabled && !!i.credentials && !!i.workspaceId
    );

    if (asanaIntegrations.length === 0) {
      return NextResponse.json({ projects: [] });
    }

    const allProjects: AsanaProject[] = [];

    for (const integration of asanaIntegrations) {
      try {
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

        const projects = await getProjects(credentials.accessToken, integration.workspaceId);

        // Add integration info to each project
        for (const project of projects) {
          allProjects.push({
            gid: project.gid,
            name: project.name,
            integrationId: integration.id,
            integrationName: integration.name,
          });
        }
      } catch (err) {
        console.error(`Error fetching projects for ${integration.name}:`, err);
        // Continue with other integrations
      }
    }

    return NextResponse.json({ projects: allProjects });
  } catch (error) {
    console.error('Error fetching Asana projects:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}
