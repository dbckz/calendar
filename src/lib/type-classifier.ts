// Server-side Type classifier. Given a batch of untyped Asana tasks and the exact
// set of "Type" enum labels valid for their integration, it assigns each task one
// of those labels. Mirrors the AI-suitability / staleness classifiers: a single
// headless `claude -p` reasoning call over the batch (pinned to Opus in
// ai-classifier). No caching — the wizard runs it on demand for the current
// untyped set, and the user reviews every suggestion before anything is written.

import { runClaudeJsonArray } from './ai-classifier';

export interface TypeClassifierTask {
  gid: string;
  title: string;
  description?: string;
  integrationName?: string;
}

export interface TypeSuggestion {
  gid: string;
  type: string; // exactly one of the allowed labels for that task's integration
}

// The "Type" enum options differ per integration, so a batch is classified one
// integration at a time — every task in a call shares the same allowed labels.
function buildPrompt(allowedTypes: string[], tasks: TypeClassifierTask[]): string {
  const allowed = allowedTypes.map(t => `"${t}"`).join(', ');
  const lines = tasks.map(t => {
    const desc = (t.description || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    return `[${t.gid}] (${t.integrationName || '?'}) ${t.title}${desc ? ` | ${desc}` : ''}`;
  });
  return `You are categorising a person's tasks by assigning each one a "Type" label used to plan their week.

Choose, for EACH task, the single best-fitting label from THIS EXACT list of allowed labels:
${allowed}

Rules:
- Return the label string EXACTLY as it appears in the list above — same words, punctuation and capitalisation. Do not invent, abbreviate, or re-word labels.
- Pick the closest fit based on the task's title and notes. If a task clearly isn't a real actionable task and a "NOT A TASK" label exists, use it.
- Every task gets exactly one label from the list.

For EACH task below, output one object. Return ONLY a JSON array, no prose, no code fences:
[{"gid":"<gid>","type":"<one of the exact allowed labels>"}]

Tasks:
${lines.join('\n')}`;
}

// Classify one integration's untyped tasks in a single headless call. Any
// returned label that isn't in allowedTypes is dropped, so the caller only ever
// sees valid, writable labels.
export async function classifyTypes(
  allowedTypes: string[],
  tasks: TypeClassifierTask[],
  timeoutSeconds = 180
): Promise<TypeSuggestion[]> {
  if (tasks.length === 0 || allowedTypes.length === 0) return [];
  const allowed = new Set(allowedTypes);
  const records = await runClaudeJsonArray(buildPrompt(allowedTypes, tasks), timeoutSeconds);
  return records
    .filter(r => typeof r.gid === 'string' && typeof r.type === 'string' && allowed.has(r.type as string))
    .map(r => ({ gid: String(r.gid), type: String(r.type) }));
}
