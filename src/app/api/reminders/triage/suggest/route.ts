import { NextRequest, NextResponse } from 'next/server';
import {
  suggestReminderTriage,
  type ReminderTriageInput,
  type WorkspaceCatalogEntry,
} from '@/lib/reminder-triage-classifier';
import { getReminderVerdicts } from '@/lib/user-data-storage';
import { buildExamplesBlock } from '@/lib/classifier-learning';

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

    // Feed Dave's own keep/convert calls back as few-shot examples. The label
    // carries the destination workspace name (resolved from the catalogue) for a
    // conversion, so the model learns both the boundary and where things go.
    const nameById = new Map(workspaces.map(w => [w.integrationId, w.name]));
    const verdicts = await getReminderVerdicts();
    const examples = buildExamplesBlock(
      Object.entries(verdicts).map(([key, v]) => ({
        key,
        label:
          v.action === 'convert'
            ? `convert${v.integrationId && nameById.has(v.integrationId) ? ` to ${nameById.get(v.integrationId)}` : ''}`
            : 'keep',
        at: v.updatedAt,
      })),
      {
        heading:
          'The person has already triaged reminders like these himself — treat them as ground truth and decide similar ones the same way:',
        render: label => label,
      }
    );

    const suggestions = await suggestReminderTriage(reminders, workspaces, 180, examples);
    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('Error suggesting reminder triage:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to suggest reminder triage' },
      { status: 500 }
    );
  }
}
