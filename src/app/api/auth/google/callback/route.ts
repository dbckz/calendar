import { NextRequest, NextResponse } from 'next/server';
import { getTokensFromCode } from '@/lib/google-calendar';
import { getIntegrationById, updateIntegration } from '@/lib/integration-storage';
import { GoogleIntegration } from '@/types';

function getRedirectUri(request: NextRequest): string {
  const host = request.headers.get('host');
  if (!host) {
    throw new Error('Missing host header');
  }
  const protocol = request.headers.get('x-forwarded-proto') || 'http';
  return `${protocol}://${host}/api/auth/google/callback`;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const state = searchParams.get('state');

  if (error) {
    return NextResponse.redirect(new URL('/settings?error=google_auth_denied', request.url));
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

    if (!integrationId) {
      return NextResponse.redirect(new URL('/settings?error=no_integration_id', request.url));
    }

    // Get the integration
    const integration = await getIntegrationById(integrationId);

    if (!integration || integration.type !== 'google') {
      return NextResponse.redirect(new URL('/settings?error=integration_not_found', request.url));
    }

    const googleIntegration = integration as GoogleIntegration;
    const redirectUri = getRedirectUri(request);

    // Exchange code for tokens
    const credentials = await getTokensFromCode(
      code,
      googleIntegration.clientId,
      googleIntegration.clientSecret,
      redirectUri
    );

    // Update integration with credentials
    await updateIntegration(integrationId, { credentials });

    return NextResponse.redirect(
      new URL(`/settings?success=google_connected&id=${integrationId}`, request.url)
    );
  } catch (err) {
    console.error('Error exchanging code for tokens:', err);
    return NextResponse.redirect(new URL('/settings?error=token_exchange_failed', request.url));
  }
}
