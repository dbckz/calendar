import { NextRequest, NextResponse } from 'next/server';
import {
  suggestReminderTriage,
  type ReminderTriageInput,
  type WorkspaceCatalogEntry,
} from '@/lib/reminder-triage-classifier';

// POST { reminders: [{ id, title, notes? }], workspaces: [{ integrationId, name,
//   projects: [{ gid, name }], types: string[] }] }
// Suggest, for each reminder, the best Asana workspace/project/type to convert it
// into. One headless reasoning call over the whole batch. Returns { suggestions:
// [{ id, integrationId, projectGid, taskType }] } — every value resolved to the
// ids/gids the wizard dropdowns use, or blank where nothing valid fit. Nothing is
// written here; the wizard reviews suggestions before applying them.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const reminders: ReminderTriageInput[] = Array.isArray(body?.reminders) ? body.reminders : [];
    const workspaces: WorkspaceCatalogEntry[] = Array.isArray(body?.workspaces) ? body.workspaces : [];

    if (reminders.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }
    if (workspaces.length === 0) {
      return NextResponse.json({ error: 'workspaces array is required' }, { status: 400 });
    }

    const suggestions = await suggestReminderTriage(reminders, workspaces);
    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('Error suggesting reminder triage:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to suggest reminder triage' },
      { status: 500 }
    );
  }
}
