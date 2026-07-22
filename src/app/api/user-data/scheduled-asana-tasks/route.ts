import { NextRequest, NextResponse } from 'next/server';
import {
  getScheduledAsanaTasks,
  scheduleAsanaTask,
  updateScheduledAsanaTask,
  updateScheduledAsanaTaskByGoogleEvent,
  unscheduleAsanaTask,
  unscheduleAllAsanaTaskInstances,
  getScheduledAsanaTasksForDate,
  getScheduleByGoogleEventId,
} from '@/lib/user-data-storage';

// GET - Fetch scheduled asana tasks (optionally filtered by date or googleEventId)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const googleEventId = searchParams.get('googleEventId');

    if (googleEventId) {
      const schedule = await getScheduleByGoogleEventId(googleEventId);
      return NextResponse.json({ schedule });
    }

    if (date) {
      const tasks = await getScheduledAsanaTasksForDate(date);
      return NextResponse.json({ tasks });
    }

    const tasks = await getScheduledAsanaTasks();
    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('Error fetching scheduled asana tasks:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch scheduled asana tasks' },
      { status: 500 }
    );
  }
}

// POST - Schedule an asana task
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { asanaTaskId, integrationId, scheduledDate, scheduledTime, duration, googleEventId, googleIntegrationId, taskName } = body;

    if (!asanaTaskId || typeof asanaTaskId !== 'string') {
      return NextResponse.json({ error: 'asanaTaskId is required' }, { status: 400 });
    }

    if (!scheduledDate || typeof scheduledDate !== 'string') {
      return NextResponse.json({ error: 'scheduledDate is required' }, { status: 400 });
    }

    if (!scheduledTime || typeof scheduledTime !== 'string') {
      return NextResponse.json({ error: 'scheduledTime is required' }, { status: 400 });
    }

    if (!duration || typeof duration !== 'number') {
      return NextResponse.json({ error: 'duration is required' }, { status: 400 });
    }

    const scheduled = await scheduleAsanaTask(
      asanaTaskId,
      integrationId,
      scheduledDate,
      scheduledTime,
      duration,
      googleEventId,
      googleIntegrationId,
      typeof taskName === 'string' ? taskName : undefined
    );

    return NextResponse.json({ scheduled });
  } catch (error) {
    console.error('Error scheduling asana task:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to schedule asana task' },
      { status: 500 }
    );
  }
}

// PATCH - Update a scheduled asana task
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, googleEventId, ...updates } = body;

    // Update by Google event ID if provided
    if (googleEventId && !id) {
      const schedule = await updateScheduledAsanaTaskByGoogleEvent(googleEventId, updates);

      if (!schedule) {
        return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
      }

      return NextResponse.json({ schedule });
    }

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id or googleEventId is required' }, { status: 400 });
    }

    const schedule = await updateScheduledAsanaTask(id, updates);

    if (!schedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }

    return NextResponse.json({ schedule });
  } catch (error) {
    console.error('Error updating scheduled asana task:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update scheduled asana task' },
      { status: 500 }
    );
  }
}

// DELETE - Unschedule an asana task
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, asanaTaskId, all } = body;

    // Delete all instances of a task
    if (all && asanaTaskId) {
      const count = await unscheduleAllAsanaTaskInstances(asanaTaskId);
      return NextResponse.json({ success: true, removedCount: count });
    }

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const success = await unscheduleAsanaTask(id);

    if (!success) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error unscheduling asana task:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to unschedule asana task' },
      { status: 500 }
    );
  }
}
