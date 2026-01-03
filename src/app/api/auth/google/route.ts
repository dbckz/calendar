import { NextRequest, NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/google-calendar';
import { cookies } from 'next/headers';

export async function GET() {
  const cookieStore = await cookies();
  const settingsStr = cookieStore.get('planner-settings')?.value;

  if (!settingsStr) {
    return NextResponse.json({ error: 'Settings not found' }, { status: 400 });
  }

  try {
    const settings = JSON.parse(settingsStr);
    const { clientId, clientSecret } = settings.googleCalendar;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Google Calendar credentials not configured' },
        { status: 400 }
      );
    }

    const authUrl = getAuthUrl(clientId, clientSecret);
    return NextResponse.json({ authUrl });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    return NextResponse.json({ error: 'Failed to generate auth URL' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { clientId, clientSecret } = await request.json();

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Client ID and Secret are required' },
      { status: 400 }
    );
  }

  try {
    const cookieStore = await cookies();
    const existingSettings = cookieStore.get('planner-settings')?.value;
    const settings = existingSettings ? JSON.parse(existingSettings) : {};

    const updatedSettings = {
      ...settings,
      googleCalendar: {
        ...settings.googleCalendar,
        enabled: true,
        clientId,
        clientSecret,
      },
    };

    cookieStore.set('planner-settings', JSON.stringify(updatedSettings), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    });

    const authUrl = getAuthUrl(clientId, clientSecret);
    return NextResponse.json({ authUrl });
  } catch (error) {
    console.error('Error saving credentials:', error);
    return NextResponse.json({ error: 'Failed to save credentials' }, { status: 500 });
  }
}
