import { NextRequest, NextResponse } from 'next/server';
import { getTokensFromCode } from '@/lib/google-calendar';
import { cookies } from 'next/headers';

function getRedirectUri(request: NextRequest): string {
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = request.headers.get('x-forwarded-proto') || 'http';
  return `${protocol}://${host}/api/auth/google/callback`;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL('/settings?error=google_auth_denied', request.url));
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
    const { clientId, clientSecret } = settings.googleCalendar;

    const redirectUri = getRedirectUri(request);
    const credentials = await getTokensFromCode(code, clientId, clientSecret, redirectUri);

    const updatedSettings = {
      ...settings,
      googleCalendar: {
        ...settings.googleCalendar,
        credentials,
      },
    };

    cookieStore.set('planner-settings', JSON.stringify(updatedSettings), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    });

    return NextResponse.redirect(new URL('/settings?success=google_connected', request.url));
  } catch (error) {
    console.error('Error exchanging code for tokens:', error);
    return NextResponse.redirect(new URL('/settings?error=token_exchange_failed', request.url));
  }
}
