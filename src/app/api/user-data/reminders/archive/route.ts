import { NextResponse } from 'next/server';
import { getGoogleTasksIntegration, archiveCompletedTasks } from '@/lib/google-tasks';

export async function POST() {
  try {
    const { credentials, integration } = await getGoogleTasksIntegration();
    const archivedCount = await archiveCompletedTasks(credentials, integration.clientId, integration.clientSecret);
    return NextResponse.json({ success: true, archivedCount });
  } catch (error) {
    console.error('Error archiving reminders:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to archive reminders' },
      { status: 500 },
    );
  }
}
