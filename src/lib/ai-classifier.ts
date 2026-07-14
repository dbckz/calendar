// Server-side AI-suitability classifier. Runs headless `claude -p` over a batch
// of tasks and returns, for each, whether an agent could realistically complete
// it end-to-end. Results are cached per task (see user-data-storage
// aiClassification) keyed by a content hash + this prompt's version, so unchanged
// tasks are never re-assessed.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';

export interface ClassifierTask {
  gid: string;
  title: string;
  description?: string;
  integrationName?: string;
}

export interface ClassifierResult {
  gid: string;
  aiSuitable: boolean;
  reason: string;
}

// The classification brief. Editing this changes PROMPT_VERSION (a hash of the
// template), which invalidates every cached result so the next run re-assesses.
const PROMPT_TEMPLATE = `You are triaging a person's task list to decide which tasks an AI agent could realistically complete end to end on their behalf, producing a genuinely useful deliverable.

The agent CAN: search and read the web, fetch and summarise URLs and Google Docs, draft written content (blog posts, briefs, emails, lists, comparison tables), research how a process/application works, and use connectors for Gmail, Google Calendar, Google Drive, Asana, Slack and HubSpot.
The agent CANNOT: run code or a shell, access X/Twitter, Notion or Google Forms, take account/physical/financial actions (signing up, paying, deleting account data, booking), watch videos, or make decisions that depend on the person's private judgement or personal voice/opinion when no brief is given.

Guidance for judging:
- A task phrased as "look at X", "read X", "review X", "check X", "have a look at X", "consider X" is USUALLY AI-suitable. The person is instructing THEMSELVES (a human) to go and look — an agent can do that looking, reading and summarising for them and report back. Mark aiSuitable=true unless it needs a connector the agent lacks (e.g. X/Twitter, Notion) or is a video to watch.
- "Figure out how to join / apply to / get onto X" (understanding a process) is AI-suitable, even if the final application must be done by the human.
- Drafting a first version of a blog post or written piece from a clear source, brief or Google Doc is AI-suitable.
- Research, collation, comparison and summarisation tasks are AI-suitable.
- NOT suitable: tasks needing the person's own decision/voice with no brief, account/physical/financial actions, writing or running code, or tasks requiring a tool/connector the agent does not have.

For EACH task below, output one object. Return ONLY a JSON array, no prose, no code fences:
[{"gid":"<gid>","aiSuitable":true|false,"reason":"<=12 words"}]

Tasks:
{{TASKS}}`;

export const PROMPT_VERSION = createHash('sha256').update(PROMPT_TEMPLATE).digest('hex').slice(0, 12);

// Stable per-task fingerprint. Changes only when the title or description changes.
export function contentHash(task: ClassifierTask): string {
  return createHash('sha256')
    .update(`${task.title}\n${task.description || ''}`)
    .digest('hex')
    .slice(0, 16);
}

function claudeBin(): string {
  return process.env.CLAUDE_BIN || path.join(homedir(), '.local', 'bin', 'claude');
}

function buildPrompt(tasks: ClassifierTask[]): string {
  const lines = tasks.map(t => {
    const desc = (t.description || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    return `[${t.gid}] (${t.integrationName || '?'}) ${t.title}${desc ? ` | ${desc}` : ''}`;
  });
  return PROMPT_TEMPLATE.replace('{{TASKS}}', lines.join('\n'));
}

// Recover the JSON array of results from the model's (possibly fenced/prose-wrapped) text.
function extractResults(text: string): ClassifierResult[] {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(r => r && typeof r.gid === 'string')
      .map(r => ({ gid: String(r.gid), aiSuitable: Boolean(r.aiSuitable), reason: String(r.reason || '').slice(0, 120) }));
  } catch {
    return [];
  }
}

interface ClaudeEnvelope { result?: unknown; is_error?: boolean }

// Classify a batch in a single headless call. No tools are needed (pure reasoning
// over the supplied text), so the runner passes an empty allowlist.
export async function classifyTasks(tasks: ClassifierTask[], timeoutSeconds = 180): Promise<ClassifierResult[]> {
  if (tasks.length === 0) return [];

  const bin = claudeBin();
  const args = ['-p', buildPrompt(tasks), '--output-format', 'json', '--allowedTools', ''];
  const env = {
    ...process.env,
    PATH: `/opt/homebrew/bin:/usr/local/bin:${path.join(homedir(), '.local', 'bin')}:${process.env.PATH || '/usr/bin:/bin'}`,
  };

  const stdout = await new Promise<string>((resolve, reject) => {
    let out = '';
    let err = '';
    let settled = false;
    const child = spawn(bin, args, { env });
    const timer = setTimeout(() => { settled = true; child.kill('SIGKILL'); reject(new Error(`AI classifier timed out after ${timeoutSeconds}s.`)); }, timeoutSeconds * 1000);

    child.stdout.on('data', (c: Buffer) => { out += c.toString('utf8'); });
    child.stderr.on('data', (c: Buffer) => { err += c.toString('utf8'); });
    child.on('error', (e: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(e.code === 'ENOENT'
        ? new Error(`Claude CLI not found at "${bin}". Set CLAUDE_BIN to the claude binary path.`)
        : e);
    });
    child.on('close', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!out.trim()) { reject(new Error(`Claude CLI returned no output.${err ? `\n${err}` : ''}`.trim())); return; }
      resolve(out);
    });
  });

  let envelope: ClaudeEnvelope;
  try {
    envelope = JSON.parse(stdout) as ClaudeEnvelope;
  } catch {
    // Some CLI configs stream plain text; fall back to parsing stdout directly.
    return extractResults(stdout);
  }
  return extractResults(typeof envelope.result === 'string' ? envelope.result : stdout);
}
