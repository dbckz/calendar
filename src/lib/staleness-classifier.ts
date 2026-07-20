// Server-side staleness classifier. Judges which tasks look old / abandoned /
// no-longer-relevant and are candidates for deletion. Mirrors the AI-suitability
// classifier: a versioned prompt + per-task content hash so unchanged tasks
// aren't re-assessed. Results are cached (see user-data-storage staleClassification).

import { createHash } from 'node:crypto';
import { runClaudeJsonArray } from './ai-classifier';

export interface StaleTask {
  gid: string;
  title: string;
  description?: string;
  createdAt?: string;
  dueOn?: string;
  startOn?: string;
  integrationName?: string;
}

export interface StaleResult {
  gid: string;
  stale: boolean;
  reason: string;
}

// Editing this changes STALE_PROMPT_VERSION (a hash), invalidating cached verdicts.
const PROMPT_TEMPLATE = `You are reviewing a person's task list to flag tasks that look STALE — old, abandoned, or no longer worth doing — so they can be considered for deletion. Today's date is {{TODAY}}.

Flag a task as stale (stale=true) when the evidence suggests it is unlikely to still matter, for example:
- It is long overdue (due date well in the past) with no sign it's still live.
- It was created a long time ago and never actioned, and reads like a fleeting idea or one-off reminder.
- It is tied to a moment that has passed (prep for an event/meeting/deadline that is now in the past).
- It is vague, a duplicate, or a "look at this later" note that has clearly gone cold.

Do NOT flag a task as stale when:
- It has a future or recent due date, or was created recently.
- It is open-ended but clearly still relevant (an ongoing goal, a standing responsibility, a substantive piece of work).
- You are unsure. Be CONSERVATIVE — only flag clear candidates. When in doubt, stale=false.

For EACH task below, output one object. Return ONLY a JSON array, no prose, no code fences:
[{"gid":"<gid>","stale":true|false,"reason":"<=12 words on why (or why not)"}]

Tasks (created | due | start | title | notes):
{{TASKS}}`;

export const STALE_PROMPT_VERSION = createHash('sha256').update(PROMPT_TEMPLATE).digest('hex').slice(0, 12);

// Staleness depends on the dates, so fold due/start into the fingerprint (title
// and notes too). Created date is immutable, so it needn't be hashed.
export function staleContentHash(task: StaleTask): string {
  return createHash('sha256')
    .update(`${task.title}\n${task.description || ''}\n${task.dueOn || ''}\n${task.startOn || ''}`)
    .digest('hex')
    .slice(0, 16);
}

function buildPrompt(tasks: StaleTask[], todayIso: string): string {
  const lines = tasks.map(t => {
    const desc = (t.description || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    return `[${t.gid}] created:${t.createdAt?.slice(0, 10) || '?'} due:${t.dueOn || 'none'} start:${t.startOn || 'none'} | (${t.integrationName || '?'}) ${t.title}${desc ? ` | ${desc}` : ''}`;
  });
  return PROMPT_TEMPLATE.replace('{{TODAY}}', todayIso.slice(0, 10)).replace('{{TASKS}}', lines.join('\n'));
}

export async function classifyStale(tasks: StaleTask[], todayIso: string, timeoutSeconds = 180): Promise<StaleResult[]> {
  if (tasks.length === 0) return [];
  const records = await runClaudeJsonArray(buildPrompt(tasks, todayIso), timeoutSeconds);
  return records
    .filter(r => typeof r.gid === 'string')
    .map(r => ({ gid: String(r.gid), stale: Boolean(r.stale), reason: String(r.reason || '').slice(0, 120) }));
}
