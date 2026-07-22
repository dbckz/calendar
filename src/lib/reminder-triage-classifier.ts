// Server-side reminder-triage suggester. Given a batch of Google Tasks reminders
// and the catalogue of Asana workspaces the user could file them under (each with
// its projects and "Type" labels), it suggests — for EACH reminder — which
// workspace, project and task type it would best become if converted to an Asana
// task. Mirrors the Type / AI-suitability classifiers: a single headless
// `claude -p` reasoning call over the whole batch (pinned to Opus in
// ai-classifier), no tools, no caching. The wizard reviews and can override every
// suggestion via dropdowns before anything is written, so the model output is
// advisory only.

import { runClaudeJsonArray } from './ai-classifier';

export interface ReminderTriageInput {
  id: string;
  title: string;
  notes?: string;
}

export interface WorkspaceCatalogEntry {
  integrationId: string;
  name: string; // display name, e.g. "OM" / "DBC"
  projects: Array<{ gid: string; name: string }>;
  types: string[]; // exact "Type" enum labels writable for this workspace
}

// A resolved suggestion, expressed in the ids/gids the wizard dropdowns use. Any
// field the model couldn't validly fill is left blank (projectGid/taskType) — the
// dropdowns make it correctable.
export interface ReminderSuggestion {
  id: string;
  integrationId: string;
  projectGid: string;
  taskType: string;
}

function buildPrompt(reminders: ReminderTriageInput[], workspaces: WorkspaceCatalogEntry[]): string {
  const catalogue = workspaces
    .map(w => {
      const projects = w.projects.length ? w.projects.map(p => `"${p.name}"`).join(', ') : '(none)';
      const types = w.types.length ? w.types.map(t => `"${t}"`).join(', ') : '(none)';
      return `- "${w.name}": projects: ${projects}; types: ${types}`;
    })
    .join('\n');

  const lines = reminders.map(r => {
    const notes = (r.notes || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    return `[${r.id}] ${r.title}${notes ? ` | ${notes}` : ''}`;
  });

  return `A person is triaging their quick "reminders" and deciding which ones to promote into their Asana task manager. For EACH reminder, suggest the best-fitting destination.

Available Asana workspaces (choose one by its EXACT name):
${catalogue}

Rules:
- "workspace": the exact workspace name from the list above that best fits the reminder's subject (e.g. work vs. a specific client/org).
- "project": the exact project name from THAT chosen workspace's projects, or "" if none fits or the workspace has no projects. Never use a project from a different workspace.
- "type": the exact type label from THAT chosen workspace's types, or "" if none clearly fits or the workspace has no types.
- Copy names/labels EXACTLY as written above — same words, punctuation and capitalisation. Do not invent values.

For EACH reminder below, output one object. Return ONLY a JSON array, no prose, no code fences:
[{"id":"<id>","workspace":"<exact workspace name>","project":"<exact project name or empty>","type":"<exact type label or empty>"}]

Reminders:
${lines.join('\n')}`;
}

// Pure mapping from the model's (name-based) records to id/gid-based suggestions,
// validated against the supplied catalogue. Exported for unit testing. A record
// whose workspace name doesn't match any workspace is dropped (the caller then
// applies its own default); project/type that don't belong to the resolved
// workspace are blanked rather than dropping the whole suggestion.
export function resolveSuggestions(
  records: Record<string, unknown>[],
  workspaces: WorkspaceCatalogEntry[],
): ReminderSuggestion[] {
  const byName = new Map(workspaces.map(w => [w.name.toLowerCase(), w]));
  const out: ReminderSuggestion[] = [];
  for (const r of records) {
    const id = typeof r.id === 'string' ? r.id : null;
    const wsName = typeof r.workspace === 'string' ? r.workspace : '';
    if (!id) continue;
    const ws = byName.get(wsName.toLowerCase());
    if (!ws) continue; // unknown workspace — let the caller default it

    const projName = typeof r.project === 'string' ? r.project.toLowerCase() : '';
    const project = ws.projects.find(p => p.name.toLowerCase() === projName);

    const typeLabel = typeof r.type === 'string' ? r.type : '';
    const taskType = ws.types.includes(typeLabel) ? typeLabel : '';

    out.push({
      id,
      integrationId: ws.integrationId,
      projectGid: project?.gid ?? '',
      taskType,
    });
  }
  return out;
}

// Suggest a destination for a whole batch of reminders in ONE headless call.
export async function suggestReminderTriage(
  reminders: ReminderTriageInput[],
  workspaces: WorkspaceCatalogEntry[],
  timeoutSeconds = 180,
): Promise<ReminderSuggestion[]> {
  if (reminders.length === 0 || workspaces.length === 0) return [];
  const records = await runClaudeJsonArray(buildPrompt(reminders, workspaces), timeoutSeconds);
  return resolveSuggestions(records, workspaces);
}
