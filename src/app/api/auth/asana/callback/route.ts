import { NextRequest, NextResponse } from 'next/server';
import { getAsanaTokensFromCode, getWorkspaces } from '@/lib/asana';
import { cookies } from 'next/headers';

function getRedirectUri(request: NextRequest): string {
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = request.headers.get('x-forwarded-proto') || 'http';
  return `${protocol}://${host}/api/auth/asana/callback`;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL('/settings?error=asana_auth_denied', request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/settings?error=no_code', request.url));
  }

  const cookieStore = await cookies();
  const settingsStr = cookieStore.get('planner-settings')?.value;

  if (!settingsStr) {
    return NextResponse.redirect(new URL('/settings?error=no_settings', request.url));
  }

  try {
    const settings = JSON.parse(settingsStr);
    const { clientId, clientSecret } = settings.asana;

    const redirectUri = getRedirectUri(request);
    const credentials = await getAsanaTokensFromCode(code, clientId, clientSecret, redirectUri);

    // Fetch workspaces to set the default
    const workspaces = await getWorkspaces(credentials.accessToken);

    const updatedSettings = {
      ...settings,
      asana: {
        ...settings.asana,
        credentials,
        workspaceId: workspaces.length > 0 ? workspaces[0].gid : undefined,
      },
    };

    cookieStore.set('planner-settings', JSON.stringify(updatedSettings), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    });

    return NextResponse.redirect(new URL('/settings?success=asana_connected', request.url));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error exchanging Asana code for tokens:', errorMessage);
    // Include error details in URL for debugging
    const errorUrl = new URL('/settings', request.url);
    errorUrl.searchParams.set('error', 'asana_token_exchange_failed');
    errorUrl.searchParams.set('details', encodeURIComponent(errorMessage.substring(0, 200)));
    return NextResponse.redirect(errorUrl);
  }
}
