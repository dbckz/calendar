import { NextRequest, NextResponse } from 'next/server';
import { getAsanaAuthUrl } from '@/lib/asana';
import { cookies } from 'next/headers';

function getRedirectUri(request: NextRequest): string {
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = request.headers.get('x-forwarded-proto') || 'http';
  return `${protocol}://${host}/api/auth/asana/callback`;
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
      asana: {
        ...settings.asana,
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

    const redirectUri = getRedirectUri(request);
    const authUrl = getAsanaAuthUrl(clientId, redirectUri);
    return NextResponse.json({ authUrl });
  } catch (error) {
    console.error('Error saving Asana credentials:', error);
    return NextResponse.json({ error: 'Failed to save credentials' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const { workspaceId } = await request.json();

  if (!workspaceId) {
    return NextResponse.json({ error: 'Workspace ID is required' }, { status: 400 });
  }

  try {
    const cookieStore = await cookies();
    const existingSettings = cookieStore.get('planner-settings')?.value;

    if (!existingSettings) {
      return NextResponse.json({ error: 'Settings not found' }, { status: 400 });
    }

    const settings = JSON.parse(existingSettings);

    const updatedSettings = {
      ...settings,
      asana: {
        ...settings.asana,
        workspaceId,
      },
    };

    cookieStore.set('planner-settings', JSON.stringify(updatedSettings), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating workspace:', error);
    return NextResponse.json({ error: 'Failed to update workspace' }, { status: 500 });
  }
}
