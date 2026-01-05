import { NextRequest, NextResponse } from 'next/server';
import { getTaskByName, refreshAsanaToken } from '@/lib/asana';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const taskName = searchParams.get('name') || 'Test';

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
    }

    const task = await getTaskByName(currentCredentials.accessToken, workspaceId, taskName);

    if (!task) {
      return NextResponse.json({ error: `Task "${taskName}" not found` }, { status: 404 });
    }

    return NextResponse.json(task, { status: 200 });
  } catch (error) {
    console.error('Error fetching task:', error);
    return NextResponse.json(
      { error: 'Failed to fetch task' },
      { status: 500 }
    );
  }
}
