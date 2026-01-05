import { NextRequest, NextResponse } from 'next/server';
import { getAsanaTokensFromCode, getWorkspaces } from '@/lib/asana';
import { getIntegrationById, updateIntegration } from '@/lib/integration-storage';
import { AsanaIntegration } from '@/types';

function getRedirectUri(request: NextRequest): string {
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = request.headers.get('x-forwarded-proto') || 'http';
  return `${protocol}://${host}/api/auth/asana/callback`;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const state = searchParams.get('state');

  if (error) {
    return NextResponse.redirect(new URL('/settings?error=asana_auth_denied', request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/settings?error=no_code', request.url));
  }

  if (!state) {
    return NextResponse.redirect(new URL('/settings?error=no_state', request.url));
  }

  try {
    // Parse state to get integration ID
    const stateData = JSON.parse(decodeURIComponent(state));
    const { integrationId } = stateData;

    console.log('[Asana Callback] Processing for integration:', integrationId);

    if (!integrationId) {
      return NextResponse.redirect(new URL('/settings?error=no_integration_id', request.url));
    }

    // Get the integration
    const integration = await getIntegrationById(integrationId);

    if (!integration || integration.type !== 'asana') {
      console.error('[Asana Callback] Integration not found:', integrationId);
      return NextResponse.redirect(new URL('/settings?error=integration_not_found', request.url));
    }

    const asanaIntegration = integration as AsanaIntegration;
    console.log('[Asana Callback] Found integration:', {
      id: asanaIntegration.id,
      name: asanaIntegration.name,
      clientId: asanaIntegration.clientId.substring(0, 10) + '...',
    });

    const redirectUri = getRedirectUri(request);

    // Exchange code for tokens
    const credentials = await getAsanaTokensFromCode(
      code,
      asanaIntegration.clientId,
      asanaIntegration.clientSecret,
      redirectUri
    );

    // Fetch workspaces to set the default
    const workspaces = await getWorkspaces(credentials.accessToken);
    console.log('[Asana Callback] Found workspaces:', workspaces.map(w => ({ gid: w.gid, name: w.name })));
    const workspaceId = workspaces.length > 0 ? workspaces[0].gid : undefined;
    console.log('[Asana Callback] Selected workspaceId:', workspaceId);

    // Update integration with credentials and workspace
    await updateIntegration(integrationId, {
      credentials,
      workspaceId,
    });

    return NextResponse.redirect(
      new URL(`/settings?success=asana_connected&id=${integrationId}`, request.url)
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error exchanging Asana code for tokens:', errorMessage);
    const errorUrl = new URL('/settings', request.url);
    errorUrl.searchParams.set('error', 'asana_token_exchange_failed');
    errorUrl.searchParams.set('details', encodeURIComponent(errorMessage.substring(0, 200)));
    return NextResponse.redirect(errorUrl);
  }
}
