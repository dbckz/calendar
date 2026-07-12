import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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

interface OpenClawPayload {
  meta?: {
    finalAssistantRawText?: string;
    finalAssistantVisibleText?: string;
  };
  payloads?: Array<{ text?: string }>;
}

function getPayloadTextCandidates(payload: OpenClawPayload): string[] {
  const candidates: unknown[] = [
    payload?.meta?.finalAssistantRawText,
    payload?.meta?.finalAssistantVisibleText,
  ];

  if (Array.isArray(payload?.payloads)) {
    for (const item of payload.payloads) {
      if (typeof item?.text === 'string' && item.text.trim()) {
        candidates.push(item.text);
      }
    }
  }

  return candidates.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

export function extractStructuredReportFromPayload(payload: OpenClawPayload): ContainerReport | null {
  for (const candidate of getPayloadTextCandidates(payload)) {
    const parsed = extractStructuredReportFromText(candidate);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

interface RunOpenClawTaskInput {
  agent: string;
  prompt: string;
  timeoutSeconds: number;
  sessionKey?: string;
}

export async function runOpenClawTask({ agent, prompt, timeoutSeconds, sessionKey }: RunOpenClawTaskInput): Promise<ContainerReport> {
  const args = [
    'agent',
    '--local',
    '--agent', agent,
    '--json',
    '--thinking', 'off',
    '--timeout', String(timeoutSeconds),
    '--message', prompt,
  ];

  if (sessionKey) {
    args.push('--session-key', sessionKey);
  }

  const { stdout, stderr } = await execFileAsync('openclaw', args, {
    maxBuffer: 10 * 1024 * 1024,
  });

  if (!stdout.trim()) {
    throw new Error(`OpenClaw returned empty stdout.${stderr ? `\n${stderr}` : ''}`.trim());
  }

  const payload = JSON.parse(stdout) as OpenClawPayload;
  const parsed = extractStructuredReportFromPayload(payload);
  if (parsed) {
    return parsed;
  }

  const textCandidates = getPayloadTextCandidates(payload);
  const rawText = textCandidates[0] || '';
  throw new Error(`OpenClaw returned non-JSON output: ${stripCodeFences(rawText)}\n${stderr || ''}`.trim());
}
