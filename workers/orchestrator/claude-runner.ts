import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { promisify } from 'node:util';
import { config } from './config';
import type { ContainerReport } from './types';

const execFileAsync = promisify(execFile);

const REPORT_KEYS = ['status', 'summary', 'outputs', 'next'] as const;

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
}

function isStructuredReport(value: unknown): value is ContainerReport {
  return Boolean(
    value
    && typeof value === 'object'
    && REPORT_KEYS.every(key => Object.hasOwn(value as object, key))
    && typeof (value as ContainerReport).status === 'string'
    && typeof (value as ContainerReport).summary === 'string'
    && Array.isArray((value as ContainerReport).outputs)
    && typeof (value as ContainerReport).next === 'string',
  );
}

function tryParseJsonCandidate(text: string): ContainerReport | null {
  try {
    const parsed = JSON.parse(text);
    return isStructuredReport(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractBalancedJsonObjects(text: string): string[] {
  const candidates: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        start = i;
      }
      depth += 1;
      continue;
    }

    if (char === '}') {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return candidates;
}

// Transport-agnostic: recover the {status,summary,outputs,next} report from an
// arbitrary blob of assistant text (direct JSON, fenced JSON, or JSON embedded
// in prose). Carried over unchanged from the previous runner.
export function extractStructuredReportFromText(text: unknown): ContainerReport | null {
  const cleaned = stripCodeFences(String(text || ''));
  const direct = tryParseJsonCandidate(cleaned);
  if (direct) {
    return direct;
  }

  const candidates = extractBalancedJsonObjects(cleaned);
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const parsed = tryParseJsonCandidate(candidates[i]);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

// The envelope emitted by `claude -p --output-format json`. The assistant's
// final text lands in `result`; `is_error`/`subtype` flag CLI-level failures.
interface ClaudeJsonEnvelope {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: unknown;
  error?: unknown;
}

export function extractStructuredReportFromEnvelope(envelope: ClaudeJsonEnvelope): ContainerReport | null {
  if (typeof envelope?.result === 'string') {
    return extractStructuredReportFromText(envelope.result);
  }
  return null;
}

interface RunClaudeTaskInput {
  prompt: string;
  timeoutSeconds: number;
  allowedTools: string;
  claudeBin?: string;
  cwd?: string;
}

export async function runClaudeTask({
  prompt,
  timeoutSeconds,
  allowedTools,
  claudeBin = config.claudeBin,
  cwd = config.agentWorkspace,
}: RunClaudeTaskInput): Promise<ContainerReport> {
  // Land any Write output in a dedicated scratch workspace, never the repo.
  await mkdir(cwd, { recursive: true });

  const args = [
    '-p', prompt,
    '--output-format', 'json',
    '--allowedTools', allowedTools,
  ];

  let stdout: string;
  let stderr: string;
  try {
    ({ stdout, stderr } = await execFileAsync(claudeBin, args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
      timeout: timeoutSeconds * 1000,
    }));
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { killed?: boolean; stderr?: string };
    if (err.code === 'ENOENT') {
      throw new Error(
        `Claude CLI not found at "${claudeBin}". Install it or set CLAUDE_BIN to the claude binary path.`,
      );
    }
    if (err.killed) {
      throw new Error(`Claude CLI timed out after ${timeoutSeconds}s.${err.stderr ? `\n${err.stderr}` : ''}`.trim());
    }
    throw error;
  }

  if (!stdout.trim()) {
    throw new Error(`Claude CLI returned empty stdout.${stderr ? `\n${stderr}` : ''}`.trim());
  }

  let envelope: ClaudeJsonEnvelope;
  try {
    envelope = JSON.parse(stdout) as ClaudeJsonEnvelope;
  } catch {
    throw new Error(`Claude CLI returned non-JSON output: ${stripCodeFences(stdout)}`.trim());
  }

  const parsed = extractStructuredReportFromEnvelope(envelope);
  if (parsed) {
    return parsed;
  }

  const resultText = typeof envelope.result === 'string' ? envelope.result : stdout;
  const flag = envelope.is_error ? ' (is_error)' : '';
  throw new Error(`Claude CLI returned no usable report${flag}: ${stripCodeFences(resultText)}${stderr ? `\n${stderr}` : ''}`.trim());
}
