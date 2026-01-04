import { NextRequest, NextResponse } from 'next/server';
import { getTasksForDate, asanaTaskToCalendarEvent, refreshAsanaToken } from '@/lib/asana';
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

    if (!settings.asana?.enabled || !settings.asana?.credentials) {
      return NextResponse.json({ error: 'Asana not configured' }, { status: 401 });
    }

    const { clientId, clientSecret, credentials, workspaceId } = settings.asana;

    if (!workspaceId) {
      return NextResponse.json({ error: 'Asana workspace not selected' }, { status: 400 });
    }

    // Check if token needs refresh
    let currentCredentials = credentials;
    if (credentials.expiresAt && Date.now() >= credentials.expiresAt - 60000) {
      currentCredentials = await refreshAsanaToken(credentials.refreshToken, clientId, clientSecret);

      // Update cookies with new credentials
      const updatedSettings = {
        ...settings,
        asana: {
          ...settings.asana,
          credentials: currentCredentials,
        },
      };

      cookieStore.set('planner-settings', JSON.stringify(updatedSettings), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    const tasks = await getTasksForDate(currentCredentials.accessToken, workspaceId, dateStr);
    const events = tasks.map(asanaTaskToCalendarEvent);

    return NextResponse.json(events);
  } catch (error) {
    console.error('Error fetching Asana tasks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Asana tasks' },
      { status: 500 }
    );
  }
}
