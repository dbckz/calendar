import { NextRequest, NextResponse } from 'next/server';

import { getProjects, refreshAsanaToken } from '@/lib/asana';
import { getIntegrations, updateIntegration } from '@/lib/integration-storage';
import { inferGoal } from '@/lib/goal-inference';
import { getAllSessions } from '@/lib/storage/exercise';
import type { AsanaIntegration, AsanaProject } from '@/types';

// POST /api/goals/infer  { text, sectionId? }
//
// Free text in, a structured goal + progression-plan proposal out. Nothing is
// written: the editor prefills from `proposal` and Dave confirms. `proposal` is
// null when the model is unavailable or returns nothing usable, and the editor
// falls back to the blank manual form.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const text = typeof body.text === 'string' ? body.text : '';
    if (!text.trim()) {
      return NextResponse.json({ error: 'A goal description is required' }, { status: 400 });
    }

    const [sessions, projects] = await Promise.all([getAllSessions(), loadAsanaProjects()]);

    const proposal = await inferGoal(text, {
      requestedSectionId: typeof body.sectionId === 'string' ? body.sectionId : undefined,
      sessions,
      projects,
    });

    return NextResponse.json({ proposal });
  } catch (error) {
    console.error('Error inferring goal:', error);
    return NextResponse.json({ error: 'Failed to infer goal' }, { status: 500 });
  }
}

// The Asana project catalogue the inference chooses an asana-project ref from.
// Mirrors /api/asana-projects: every enabled, credentialled workspace, tokens
// refreshed as needed, failures per workspace swallowed so one bad integration
// doesn't sink the proposal.
async function loadAsanaProjects(): Promise<AsanaProject[]> {
  const { asanaIntegrations } = await getIntegrations();
  const usable = asanaIntegrations.filter(
    (i): i is AsanaIntegration & {
      credentials: NonNullable<AsanaIntegration['credentials']>;
      workspaceId: string;
    } => i.enabled && !!i.credentials && !!i.workspaceId
  );

  const all: AsanaProject[] = [];
  for (const integration of usable) {
    try {
      let credentials = integration.credentials;
      if (credentials.expiresAt && Date.now() >= credentials.expiresAt - 60000) {
        credentials = await refreshAsanaToken(
          credentials.refreshToken!,
          integration.clientId,
          integration.clientSecret
        );
        await updateIntegration(integration.id, { credentials });
      }
      const projects = await getProjects(credentials.accessToken, integration.workspaceId);
      for (const project of projects) {
        all.push({
          gid: project.gid,
          name: project.name,
          integrationId: integration.id,
          integrationName: integration.name,
          modifiedAt: project.modifiedAt,
        });
      }
    } catch (err) {
      console.error(`Error fetching projects for ${integration.name}:`, err);
    }
  }
  return all;
}
