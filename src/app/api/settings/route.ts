import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET() {
  const cookieStore = await cookies();
  const settingsStr = cookieStore.get('planner-settings')?.value;

  if (!settingsStr) {
    return NextResponse.json({
      googleCalendar: {
        enabled: false,
        connected: false,
      },
      asana: {
        enabled: false,
        connected: false,
      },
    });
  }

  try {
    const settings = JSON.parse(settingsStr);

    // Return sanitized settings (no secrets)
    return NextResponse.json({
      googleCalendar: {
        enabled: settings.googleCalendar?.enabled || false,
        connected: !!settings.googleCalendar?.credentials?.accessToken,
        hasCredentials: !!(settings.googleCalendar?.clientId && settings.googleCalendar?.clientSecret),
      },
      asana: {
        enabled: settings.asana?.enabled || false,
        connected: !!settings.asana?.accessToken,
        workspaceId: settings.asana?.workspaceId,
      },
    });
  } catch (error) {
    console.error('Error parsing settings:', error);
    return NextResponse.json({
      googleCalendar: { enabled: false, connected: false },
      asana: { enabled: false, connected: false },
    });
  }
}

export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const integration = searchParams.get('integration');

  const cookieStore = await cookies();
  const settingsStr = cookieStore.get('planner-settings')?.value;

  if (!settingsStr) {
    return NextResponse.json({ success: true });
  }

  try {
    const settings = JSON.parse(settingsStr);

    if (integration === 'google') {
      settings.googleCalendar = {
        enabled: false,
        clientId: '',
        clientSecret: '',
      };
    } else if (integration === 'asana') {
      settings.asana = {
        enabled: false,
        accessToken: '',
      };
    }

    cookieStore.set('planner-settings', JSON.stringify(settings), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error clearing integration:', error);
    return NextResponse.json({ error: 'Failed to clear integration' }, { status: 500 });
  }
}
