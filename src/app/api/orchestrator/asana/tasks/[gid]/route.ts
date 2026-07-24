import { NextRequest, NextResponse } from 'next/server';

import { addTaskComment } from '@/lib/asana';
import { commentToAsanaHtmlText, looksLikeAsanaHtmlText } from '@/lib/asana-rich-text';
import { resolveTaskOwner, describeIntegrations } from '@/lib/asana-orchestrator';
import { getEnabledAsanaIntegrations } from '@/lib/integration-storage';

// Orchestrator-scoped Asana routes for the headless delegation runner (via the
// local calendar-asana MCP server). Unlike /api/asana-tasks/[taskId], these do
// NOT take an integrationId — the owning integration is resolved by probing each
// enabled Asana integration, so the runner can act on tasks in EITHER the DBC or
// OM workspace through the app's own stored tokens.

// Choose the Asana html_text to post: an explicit rich comment wins; otherwise
// derive one from the plain comment (passing through text that is already Asana
// HTML), or undefined when there is no plain comment to convert.
function resolveRichComment(richComment: string, plainComment: string): string | undefined {
  if (richComment) return richComment;
  if (!plainComment) return undefined;
  return looksLikeAsanaHtmlText(plainComment) ? plainComment : commentToAsanaHtmlText(plainComment);
}

async function notFound(gid: string) {
  const integrations = await getEnabledAsanaIntegrations();
  return NextResponse.json(
    {
      error:
        `No enabled Asana integration can access task ${gid}. ` +
        `Tried: ${describeIntegrations(integrations)}. ` +
        `Check the gid is correct and that the owning workspace is connected in Settings.`,
    },
    { status: 404 }
  );
}

// GET - Fetch a single task by gid, resolving which workspace owns it.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gid: string }> }
) {
  try {
    const { gid } = await params;
    const resolved = await resolveTaskOwner(gid);
    if (!resolved) {
      return notFound(gid);
    }

    const { integration, task } = resolved;
    const workspace = task.workspace as { gid?: string; name?: string } | undefined;

    return NextResponse.json({
      task,
      integration: {
        id: integration.id,
        name: integration.name,
        workspaceId: integration.workspaceId,
        workspaceName: workspace?.name ?? null,
      },
    });
  } catch (error) {
    console.error('[orchestrator/asana] Error fetching task:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch task' },
      { status: 500 }
    );
  }
}

// POST - Add a comment (story) to a task by gid, in whichever workspace owns it.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gid: string }> }
) {
  try {
    const { gid } = await params;
    const { text, htmlText } = await request.json();
    const plainComment = typeof text === 'string' ? text.trim() : '';
    const richComment = typeof htmlText === 'string' ? htmlText.trim() : '';

    if (!plainComment && !richComment) {
      return NextResponse.json(
        { error: 'text (or htmlText) must be a non-empty string' },
        { status: 400 }
      );
    }

    const resolved = await resolveTaskOwner(gid);
    if (!resolved) {
      return notFound(gid);
    }

    const { integration, accessToken } = resolved;

    const normalizedRichComment = resolveRichComment(richComment, plainComment);

    await addTaskComment(accessToken, gid, plainComment, normalizedRichComment);

    return NextResponse.json({
      success: true,
      integration: { id: integration.id, name: integration.name },
    });
  } catch (error) {
    console.error('[orchestrator/asana] Error adding comment:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add comment' },
      { status: 500 }
    );
  }
}
