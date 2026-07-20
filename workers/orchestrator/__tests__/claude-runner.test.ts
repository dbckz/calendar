// Never invokes the real claude CLI: child_process.spawn and fs are mocked so
// the runner's streaming path can be exercised deterministically.
jest.mock('node:child_process', () => ({ spawn: jest.fn() }));
jest.mock('node:fs', () => ({ createWriteStream: jest.fn() }));
jest.mock('node:fs/promises', () => ({ mkdir: jest.fn().mockResolvedValue(undefined) }));

import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import {
  extractStructuredReportFromText,
  extractStructuredReportFromEnvelope,
  detectUsageLimit,
  runClaudeTask,
  UsageLimitError,
} from '../claude-runner';

const mockSpawn = spawn as unknown as jest.Mock;

const REPORT = { status: 'successful', summary: 'ok', outputs: ['a'], next: 'done' };

// Build a fake child process that emits the given stdout/stderr chunks, then
// closes with the given code (or emits an `error` event when provided).
function fakeChild(opts: { stdout?: string[]; stderr?: string[]; code?: number; error?: NodeJS.ErrnoException }) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: jest.Mock;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn();

  Promise.resolve().then(() => {
    if (opts.error) {
      child.emit('error', opts.error);
      return;
    }
    for (const chunk of opts.stdout ?? []) child.stdout.emit('data', Buffer.from(chunk));
    for (const chunk of opts.stderr ?? []) child.stderr.emit('data', Buffer.from(chunk));
    child.emit('close', opts.code ?? 0, null);
  });

  return child;
}

function resultEvent(result: string, extra: Record<string, unknown> = {}): string {
  return `${JSON.stringify({ type: 'result', subtype: 'success', is_error: false, session_id: 'sess-1', result, ...extra })}\n`;
}

const INIT_EVENT = `${JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess-1' })}\n`;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('extractStructuredReportFromText', () => {
  it('parses direct JSON', () => {
    const parsed = extractStructuredReportFromText('{"status":"successful","summary":"ok","outputs":[],"next":"done"}');
    expect(parsed).toEqual({ status: 'successful', summary: 'ok', outputs: [], next: 'done' });
  });

  it('parses fenced JSON', () => {
    const parsed = extractStructuredReportFromText('```json\n{"status":"successful","summary":"ok","outputs":["a"],"next":"done"}\n```');
    expect(parsed).toEqual({ status: 'successful', summary: 'ok', outputs: ['a'], next: 'done' });
  });

  it('finds the last valid report inside mixed prose', () => {
    const parsed = extractStructuredReportFromText(`Noise before

{"status":"failed","summary":"older","outputs":[],"next":"ignore"}

More noise
{"status":"successful","summary":"fresh","outputs":["draft"],"next":"ship"}`);

    expect(parsed).toEqual({ status: 'successful', summary: 'fresh', outputs: ['draft'], next: 'ship' });
  });

  it('returns null for plain prose', () => {
    expect(extractStructuredReportFromText('Forced rerun done. Curtis is back in agent_complete.')).toBeNull();
  });
});

describe('extractStructuredReportFromEnvelope', () => {
  it('extracts the report from the envelope result string', () => {
    const parsed = extractStructuredReportFromEnvelope({ result: JSON.stringify(REPORT) });
    expect(parsed).toEqual(REPORT);
  });

  it('extracts a report embedded in the envelope result prose', () => {
    const parsed = extractStructuredReportFromEnvelope({ result: `Here you go:\n${JSON.stringify(REPORT)}` });
    expect(parsed).toEqual(REPORT);
  });

  it('returns null when result is not a string', () => {
    expect(extractStructuredReportFromEnvelope({ result: undefined })).toBeNull();
    expect(extractStructuredReportFromEnvelope({ result: 42 as unknown as string })).toBeNull();
  });
});

describe('detectUsageLimit', () => {
  it('detects a session-limit message and parses the reset time', () => {
    expect(detectUsageLimit("You've hit your session limit · resets 3:45pm")).toEqual({ hit: true, resetsAt: '3:45pm' });
  });

  it('detects a usage-limit message without a reset time', () => {
    expect(detectUsageLimit('usage limit reached, try later')).toEqual({ hit: true, resetsAt: null });
  });

  it('returns not-hit for ordinary output', () => {
    expect(detectUsageLimit('all good, wrote the memo')).toEqual({ hit: false, resetsAt: null });
  });
});

describe('runClaudeTask', () => {
  const baseInput = { prompt: 'do it', timeoutSeconds: 60, allowedTools: 'Read,Write' };

  it('parses the streamed result event and returns report + sessionId', async () => {
    mockSpawn.mockImplementation(() => fakeChild({ stdout: [INIT_EVENT, resultEvent(JSON.stringify(REPORT))] }));
    const run = await runClaudeTask(baseInput);
    expect(run.report).toEqual(REPORT);
    expect(run.sessionId).toBe('sess-1');
    expect(run.resultText).toBe(JSON.stringify(REPORT));
  });

  it('reassembles a report split across stdout chunks', async () => {
    const full = resultEvent(JSON.stringify(REPORT));
    mockSpawn.mockImplementation(() => fakeChild({ stdout: [INIT_EVENT + full.slice(0, 20), full.slice(20)] }));
    const run = await runClaudeTask(baseInput);
    expect(run.report).toEqual(REPORT);
  });

  it('passes -p, stream-json --verbose, the allowlist, permission mode and disallowed tools', async () => {
    mockSpawn.mockImplementation(() => fakeChild({ stdout: [resultEvent(JSON.stringify(REPORT))] }));
    await runClaudeTask({ ...baseInput, claudeBin: '/fake/claude', cwd: '/fake/ws', permissionMode: 'bypassPermissions', disallowedTools: 'Bash' });

    const [file, args, opts] = mockSpawn.mock.calls[0];
    expect(file).toBe('/fake/claude');
    expect(args).toEqual([
      '-p', 'do it',
      '--model', 'opus',
      '--output-format', 'stream-json',
      '--verbose',
      '--allowedTools', 'Read,Write',
      '--permission-mode', 'bypassPermissions',
      '--disallowedTools', 'Bash',
    ]);
    expect(opts).toMatchObject({ cwd: '/fake/ws' });
  });

  it('throws a clear error when the binary is missing (ENOENT)', async () => {
    mockSpawn.mockImplementation(() => fakeChild({ error: Object.assign(new Error('nope'), { code: 'ENOENT' }) }));
    await expect(runClaudeTask({ ...baseInput, claudeBin: '/nope/claude' })).rejects.toThrow(/not found at "\/nope\/claude"/);
  });

  it('throws a UsageLimitError when the CLI reports a limit', async () => {
    mockSpawn.mockImplementation(() => fakeChild({ stdout: [resultEvent("You've hit your session limit · resets 3:45pm", { is_error: true })] }));
    await expect(runClaudeTask(baseInput)).rejects.toBeInstanceOf(UsageLimitError);
  });

  it('throws when no result event is emitted', async () => {
    mockSpawn.mockImplementation(() => fakeChild({ stdout: [INIT_EVENT], code: 0 }));
    await expect(runClaudeTask(baseInput)).rejects.toThrow(/no result event/);
  });

  it('throws when the result carries no usable report, flagging is_error', async () => {
    mockSpawn.mockImplementation(() => fakeChild({ stdout: [resultEvent('I could not do that.', { is_error: true })] }));
    await expect(runClaudeTask(baseInput)).rejects.toThrow(/no usable report \(is_error\)/);
  });
});
