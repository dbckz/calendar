import { NextRequest, NextResponse } from 'next/server';
import { getAsanaAuthUrl } from '@/lib/asana';
import { getIntegrationById, addAsanaIntegration, updateIntegration } from '@/lib/integration-storage';
import { AsanaIntegration } from '@/types';

function getRedirectUri(request: NextRequest): string {
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = request.headers.get('x-forwarded-proto') || 'http';
  return `${protocol}://${host}/api/auth/asana/callback`;
}

// GET - Generate auth URL for an existing integration
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const integrationId = searchParams.get('integrationId');

  if (!integrationId) {
    return NextResponse.json({ error: 'integrationId is required' }, { status: 400 });
  }

  try {
    const integration = await getIntegrationById(integrationId);

    if (!integration || integration.type !== 'asana') {
      return NextResponse.json({ error: 'Asana integration not found' }, { status: 404 });
    }

    const asanaIntegration = integration as AsanaIntegration;
    const redirectUri = getRedirectUri(request);
    const state = encodeURIComponent(JSON.stringify({ integrationId }));
    const authUrl = getAsanaAuthUrl(asanaIntegration.clientId, redirectUri, state);

    return NextResponse.json({ authUrl });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    return NextResponse.json({ error: 'Failed to generate auth URL' }, { status: 500 });
  }
}

// POST - Create new integration and return auth URL
export async function POST(request: NextRequest) {
  const { name, clientId, clientSecret } = await request.json();

  if (!name || !clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'name, clientId, and clientSecret are required' },
      { status: 400 }
    );
  }

  try {
    const id = crypto.randomUUID();
    const integration: AsanaIntegration = {
      id,
      type: 'asana',
      name,
      enabled: true,
      clientId,
      clientSecret,
      createdAt: new Date().toISOString(),
    };

    console.log('[Asana Auth] Creating new integration:', {
      id,
      name,
      clientId: clientId.substring(0, 10) + '...',
    });

    await addAsanaIntegration(integration);
    console.log('[Asana Auth] Integration saved to storage');

    // Generate auth URL with integration ID in state
    const redirectUri = getRedirectUri(request);
    const state = encodeURIComponent(JSON.stringify({ integrationId: id }));
    const authUrl = getAsanaAuthUrl(clientId, redirectUri, state);

    console.log('[Asana Auth] Generated auth URL with state:', { integrationId: id });

    return NextResponse.json({ authUrl, integrationId: id });
  } catch (error) {
    console.error('Error creating integration:', error);
    return NextResponse.json({ error: 'Failed to create integration' }, { status: 500 });
  }
}

// PUT - Update workspace for an integration
export async function PUT(request: NextRequest) {
  const { integrationId, workspaceId } = await request.json();

  if (!integrationId || !workspaceId) {
    return NextResponse.json(
      { error: 'integrationId and workspaceId are required' },
      { status: 400 }
    );
  }

  try {
    const updated = await updateIntegration(integrationId, { workspaceId });

    if (!updated) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating workspace:', error);
    return NextResponse.json({ error: 'Failed to update workspace' }, { status: 500 });
  }
}
