// Server-side matcher for the wizard's free-text priorities step. Given the
// lines the user typed and their incomplete Asana tasks, it asks the model which
// typed priority (if any) refers to an existing task. Unlike the task
// classifiers there is no cache — free text is one-off, so every call re-runs.

import { runClaudeJsonArray } from './ai-classifier';

export interface PriorityCandidate {
  gid: string;
  title: string;
  dueOn?: string;
}

export interface PriorityMatch {
  index: number;
  gid: string | null;
}

// Editing this only affects live calls (no cache to invalidate).
const PROMPT_TEMPLATE = `You are matching a person's free-text weekly priorities against their existing task list. For each priority, decide whether it refers to the SAME piece of work as one of the listed tasks.

Be CONSERVATIVE: only return a gid when the priority clearly describes the same work as that task. If a priority is new work, a vague note, or you are unsure, return gid=null so it can be created as a fresh task.

Priorities (index | text):
{{PRIORITIES}}

Existing tasks (gid | due | title):
{{TASKS}}

For EACH priority above, output one object. Return ONLY a JSON array, no prose, no code fences:
[{"index":<index>,"gid":"<matching gid>"|null}]`;

function buildPrompt(priorities: string[], tasks: PriorityCandidate[]): string {
  const priorityLines = priorities.map((text, i) => `[${i}] ${text.replace(/\s+/g, ' ').trim()}`);
  const taskLines = tasks.map(t => `${t.gid} | ${t.dueOn || 'none'} | ${t.title.replace(/\s+/g, ' ').trim()}`);
  return PROMPT_TEMPLATE
    .replace('{{PRIORITIES}}', priorityLines.join('\n'))
    .replace('{{TASKS}}', taskLines.join('\n') || '(none)');
}

// Match typed priorities against candidate tasks in one headless call. A valid
// gid is only returned when it exists in `tasks`; anything else maps to null.
export async function matchPriorities(
  priorities: string[],
  tasks: PriorityCandidate[],
  timeoutSeconds = 120
): Promise<PriorityMatch[]> {
  if (priorities.length === 0) return [];
  const validGids = new Set(tasks.map(t => t.gid));
  const records = await runClaudeJsonArray(buildPrompt(priorities, tasks), timeoutSeconds);
  const byIndex = new Map<number, string | null>();
  for (const r of records) {
    const index = typeof r.index === 'number' ? r.index : Number(r.index);
    if (!Number.isInteger(index)) continue;
    const gid = typeof r.gid === 'string' && validGids.has(r.gid) ? r.gid : null;
    byIndex.set(index, gid);
  }
  return priorities.map((_, index) => ({ index, gid: byIndex.get(index) ?? null }));
}
