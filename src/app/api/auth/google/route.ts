import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getIntegrationById, addGoogleIntegration } from '@/lib/integration-storage';
import { GoogleIntegration } from '@/types';

function getRedirectUri(request: NextRequest): string {
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = request.headers.get('x-forwarded-proto') || 'http';
  return `${protocol}://${host}/api/auth/google/callback`;
}

function getAuthUrlWithState(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  state: string
): string {
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar.events'],
    prompt: 'consent',
    state,
  });
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

    if (!integration || integration.type !== 'google') {
      return NextResponse.json({ error: 'Google integration not found' }, { status: 404 });
    }

    const googleIntegration = integration as GoogleIntegration;
    const redirectUri = getRedirectUri(request);
    const state = encodeURIComponent(JSON.stringify({ integrationId }));
    const authUrl = getAuthUrlWithState(
      googleIntegration.clientId,
      googleIntegration.clientSecret,
      redirectUri,
      state
    );

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
    const integration: GoogleIntegration = {
      id,
      type: 'google',
      name,
      enabled: true,
      clientId,
      clientSecret,
      createdAt: new Date().toISOString(),
    };

    await addGoogleIntegration(integration);

    // Generate auth URL with integration ID in state
    const redirectUri = getRedirectUri(request);
    const state = encodeURIComponent(JSON.stringify({ integrationId: id }));
    const authUrl = getAuthUrlWithState(clientId, clientSecret, redirectUri, state);

    return NextResponse.json({ authUrl, integrationId: id });
  } catch (error) {
    console.error('Error creating integration:', error);
    return NextResponse.json({ error: 'Failed to create integration' }, { status: 500 });
  }
}
