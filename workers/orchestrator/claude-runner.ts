import { spawn } from 'node:child_process';
import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config';
import type { ContainerReport } from './types';

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

// The final envelope emitted by a `claude -p` run. In `stream-json` mode this is
// the `type: "result"` event; the assistant's final text lands in `result`.
interface ClaudeJsonEnvelope {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: unknown;
  error?: unknown;
  session_id?: string;
}

export function extractStructuredReportFromEnvelope(envelope: ClaudeJsonEnvelope): ContainerReport | null {
  if (typeof envelope?.result === 'string') {
    return extractStructuredReportFromText(envelope.result);
  }
  return null;
}

// Thrown when the CLI reports it hit a usage/session limit. The pacer catches
// this, records `resetsAt` as `pausedUntil`, and stops draining until then.
export class UsageLimitError extends Error {
  resetsAt: string | null;
  constructor(message: string, resetsAt: string | null) {
    super(message);
    this.name = 'UsageLimitError';
    this.resetsAt = resetsAt;
  }
}

// Limit errors print e.g. "You've hit your session limit · resets 3:45pm" on
// stderr. Parse the `resets <time>` fragment (returned verbatim; the pacer
// resolves it to a concrete instant).
const USAGE_LIMIT_RE = /(?:hit (?:your )?(?:session|usage) limit|usage limit reached)/i;
const RESETS_RE = /resets?\s+(?:at\s+)?([0-9]{1,2}(?::[0-9]{2})?\s*(?:am|pm)?)/i;

export function detectUsageLimit(text: string): { hit: boolean; resetsAt: string | null } {
  if (!USAGE_LIMIT_RE.test(text)) {
    return { hit: false, resetsAt: null };
  }
  const match = text.match(RESETS_RE);
  return { hit: true, resetsAt: match ? match[1].trim() : null };
}

export interface RunClaudeTaskResult {
  report: ContainerReport;
  sessionId: string | null;
  resultText: string;
  traceFile: string | null; // basename of the trace file, or null when not teed
}

interface RunClaudeTaskInput {
  prompt: string;
  timeoutSeconds: number;
  allowedTools: string;
  permissionMode?: string;   // e.g. 'bypassPermissions' | 'auto'
  disallowedTools?: string;  // comma list always denied (e.g. 'Bash')
  // Absolute path to tee the raw stream-json JSONL into. Omit to skip teeing.
  traceFile?: string;
  claudeBin?: string;
  cwd?: string;
}

// Run a headless `claude -p` task using the streaming JSONL protocol. Every
// event is teed to `traceFile` in real time (so the UI can live-tail it) while
// we capture the session id and the final result envelope.
export async function runClaudeTask({
  prompt,
  timeoutSeconds,
  allowedTools,
  permissionMode = config.claudePermissionMode,
  disallowedTools = config.claudeDisallowedTools,
  traceFile,
  claudeBin = config.claudeBin,
  cwd = config.agentWorkspace,
}: RunClaudeTaskInput): Promise<RunClaudeTaskResult> {
  // Land any Write output in a dedicated scratch workspace, never the repo.
  await mkdir(cwd, { recursive: true });

  let traceStream: WriteStream | null = null;
  if (traceFile) {
    await mkdir(path.dirname(traceFile), { recursive: true });
    traceStream = createWriteStream(traceFile, { flags: 'a' });
  }

  const args = [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--allowedTools', allowedTools,
    ...(permissionMode ? ['--permission-mode', permissionMode] : []),
    ...(disallowedTools ? ['--disallowedTools', disallowedTools] : []),
  ];

  // A mutable holder so TS keeps the declared types across the closure mutation
  // in handleLine (TS narrows plain `let` captured-and-mutated vars to `never`).
  const captured: { sessionId: string | null; finalEnvelope: ClaudeJsonEnvelope | null } = {
    sessionId: null,
    finalEnvelope: null,
  };
  let stdoutBuf = '';
  let stderr = '';

  function handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    traceStream?.write(`${trimmed}\n`);
    try {
      const event = JSON.parse(trimmed) as ClaudeJsonEnvelope;
      if (typeof event.session_id === 'string' && event.session_id) {
        captured.sessionId = event.session_id;
      }
      if (event.type === 'result') {
        captured.finalEnvelope = event;
      }
    } catch {
      // Non-JSON line (shouldn't happen in stream-json mode) — traced, ignored.
    }
  }

  const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null; timedOut: boolean; spawnError?: NodeJS.ErrnoException }>((resolve) => {
    let settled = false;
    let timedOut = false;
    const child = spawn(claudeBin, args, { cwd });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutSeconds * 1000);

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString('utf8');
      let idx: number;
      while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
        handleLine(stdoutBuf.slice(0, idx));
        stdoutBuf = stdoutBuf.slice(idx + 1);
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: null, signal: null, timedOut, spawnError: err });
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (stdoutBuf.trim()) handleLine(stdoutBuf);
      resolve({ code, signal, timedOut });
    });
  });

  if (traceStream) {
    await new Promise<void>(resolve => traceStream!.end(resolve));
  }

  if (exit.spawnError) {
    if (exit.spawnError.code === 'ENOENT') {
      throw new Error(
        `Claude CLI not found at "${claudeBin}". Install it or set CLAUDE_BIN to the claude binary path.`,
      );
    }
    throw exit.spawnError;
  }

  const { sessionId, finalEnvelope } = captured;

  const combined = `${finalEnvelope && typeof finalEnvelope.result === 'string' ? finalEnvelope.result : ''}\n${stderr}`;
  const limit = detectUsageLimit(combined);
  if (limit.hit) {
    throw new UsageLimitError(
      `Claude CLI hit a usage limit${limit.resetsAt ? ` (resets ${limit.resetsAt})` : ''}.`,
      limit.resetsAt,
    );
  }

  if (exit.timedOut) {
    throw new Error(`Claude CLI timed out after ${timeoutSeconds}s.${stderr ? `\n${stderr}` : ''}`.trim());
  }

  if (!finalEnvelope) {
    throw new Error(`Claude CLI returned no result event.${stderr ? `\n${stderr}` : ''}`.trim());
  }

  const envelope: ClaudeJsonEnvelope = finalEnvelope;
  const resultText = typeof envelope.result === 'string' ? envelope.result : '';
  const parsed = extractStructuredReportFromEnvelope(envelope);
  const basename = traceFile ? path.basename(traceFile) : null;

  if (parsed) {
    return { report: parsed, sessionId, resultText, traceFile: basename };
  }

  const flag = envelope.is_error ? ' (is_error)' : '';
  throw new Error(`Claude CLI returned no usable report${flag}: ${stripCodeFences(resultText || JSON.stringify(envelope))}${stderr ? `\n${stderr}` : ''}`.trim());
}
