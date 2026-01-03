import { NextRequest, NextResponse } from 'next/server';
import { getCalendarEvents, refreshAccessToken } from '@/lib/google-calendar';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const dateStr = searchParams.get('date');

  if (!dateStr) {
    return NextResponse.json({ error: 'Date parameter is required' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const settingsStr = cookieStore.get('planner-settings')?.value;

  if (!settingsStr) {
    return NextResponse.json({ error: 'Not configured' }, { status: 401 });
  }

  try {
    const settings = JSON.parse(settingsStr);

    if (!settings.googleCalendar?.enabled || !settings.googleCalendar?.credentials) {
      return NextResponse.json({ error: 'Google Calendar not configured' }, { status: 401 });
    }

    const { clientId, clientSecret, credentials } = settings.googleCalendar;

    // Check if token needs refresh
    let currentCredentials = credentials;
    if (credentials.expiresAt && Date.now() >= credentials.expiresAt - 60000) {
      currentCredentials = await refreshAccessToken(credentials, clientId, clientSecret);

      // Update cookies with new credentials
      const updatedSettings = {
        ...settings,
        googleCalendar: {
          ...settings.googleCalendar,
          credentials: currentCredentials,
        },
      };

      cookieStore.set('planner-settings', JSON.stringify(updatedSettings), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365, // 1 year
      });
    }

    const date = new Date(dateStr);
    const events = await getCalendarEvents(currentCredentials, clientId, clientSecret, date);

    return NextResponse.json(events);
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch calendar events' },
      { status: 500 }
    );
  }
}
