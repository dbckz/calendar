import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaces } from '@/lib/asana';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  const { accessToken } = await request.json();

  if (!accessToken) {
    return NextResponse.json({ error: 'Access token is required' }, { status: 400 });
  }

  try {
    // Validate the token by fetching workspaces
    const workspaces = await getWorkspaces(accessToken);

    const cookieStore = await cookies();
    const existingSettings = cookieStore.get('planner-settings')?.value;
    const settings = existingSettings ? JSON.parse(existingSettings) : {};

    const updatedSettings = {
      ...settings,
      asana: {
        ...settings.asana,
        enabled: true,
        accessToken,
        workspaceId: workspaces.length > 0 ? workspaces[0].gid : undefined,
      },
    };

    cookieStore.set('planner-settings', JSON.stringify(updatedSettings), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    });

    return NextResponse.json({ workspaces });
  } catch (error) {
    console.error('Error validating Asana token:', error);
    return NextResponse.json(
      { error: 'Invalid access token' },
      { status: 401 }
    );
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
