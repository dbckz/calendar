import { NextRequest, NextResponse } from 'next/server';
import { getTasksForDate, asanaTaskToCalendarEvent } from '@/lib/asana';
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

    if (!settings.asana?.enabled || !settings.asana?.accessToken) {
      return NextResponse.json({ error: 'Asana not configured' }, { status: 401 });
    }

    const { accessToken, workspaceId } = settings.asana;

    if (!workspaceId) {
      return NextResponse.json({ error: 'Asana workspace not selected' }, { status: 400 });
    }

    const tasks = await getTasksForDate(accessToken, workspaceId, dateStr);
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
