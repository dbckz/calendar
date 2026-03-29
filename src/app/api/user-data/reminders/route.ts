import { NextRequest, NextResponse } from 'next/server';
import { getReminders, addReminder, updateReminder, deleteReminder } from '@/lib/user-data-storage';

export async function GET() {
  try {
    const reminders = await getReminders();
    return NextResponse.json({ reminders });
  } catch (error) {
    console.error('Error fetching reminders:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch reminders' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }
    const reminder = await addReminder(text.trim());
    return NextResponse.json({ reminder });
  } catch (error) {
    console.error('Error adding reminder:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add reminder' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, ...updates } = await request.json();
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    const reminder = await updateReminder(id, updates);
    if (!reminder) {
      return NextResponse.json({ error: 'Reminder not found' }, { status: 404 });
    }
    return NextResponse.json({ reminder });
  } catch (error) {
    console.error('Error updating reminder:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update reminder' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    const success = await deleteReminder(id);
    if (!success) {
      return NextResponse.json({ error: 'Reminder not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting reminder:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete reminder' },
      { status: 500 }
    );
  }
}
