// Never invokes the real claude CLI: child_process.execFile and fs mkdir are
// mocked so the runner's spawn path can be exercised deterministically.
jest.mock('node:child_process', () => ({ execFile: jest.fn() }));
jest.mock('node:fs/promises', () => ({ mkdir: jest.fn().mockResolvedValue(undefined) }));

import { execFile } from 'node:child_process';
import {
  extractStructuredReportFromText,
  extractStructuredReportFromEnvelope,
  runClaudeTask,
} from '../claude-runner';

const mockExecFile = execFile as unknown as jest.Mock;

// promisify(execFile) calls execFile(file, args, options, callback); make the
// mock resolve to { stdout, stderr } (or reject) via that trailing callback.
function mockCliResult(stdout: string, stderr = '') {
  mockExecFile.mockImplementation((_file, _args, _opts, cb) => cb(null, { stdout, stderr }));
}
function mockCliError(error: Partial<NodeJS.ErrnoException> & { killed?: boolean }) {
  mockExecFile.mockImplementation((_file, _args, _opts, cb) => cb(error));
}

beforeEach(() => {
  jest.clearAllMocks();
});

const REPORT = { status: 'successful', summary: 'ok', outputs: ['a'], next: 'done' };

function envelope(result: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result, ...extra });
}

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

describe('runClaudeTask', () => {
  const baseInput = { prompt: 'do it', timeoutSeconds: 60, allowedTools: 'Read,Write' };

  it('parses the CLI JSON envelope and returns the report', async () => {
    mockCliResult(envelope(JSON.stringify(REPORT)));
    const report = await runClaudeTask(baseInput);
    expect(report).toEqual(REPORT);
  });

  it('passes -p, --output-format json and the allowlist to the binary', async () => {
    mockCliResult(envelope(JSON.stringify(REPORT)));
    await runClaudeTask({ ...baseInput, claudeBin: '/fake/claude', cwd: '/fake/ws' });

    const [file, args, opts] = mockExecFile.mock.calls[0];
    expect(file).toBe('/fake/claude');
    expect(args).toEqual(['-p', 'do it', '--output-format', 'json', '--allowedTools', 'Read,Write']);
    expect(opts).toMatchObject({ cwd: '/fake/ws', timeout: 60_000 });
  });

  it('throws a clear error when the binary is missing (ENOENT)', async () => {
    mockCliError({ code: 'ENOENT' });
    await expect(runClaudeTask({ ...baseInput, claudeBin: '/nope/claude' })).rejects.toThrow(/not found at "\/nope\/claude"/);
  });

  it('throws a timeout error when the process is killed', async () => {
    mockCliError({ killed: true });
    await expect(runClaudeTask(baseInput)).rejects.toThrow(/timed out after 60s/);
  });

  it('throws on empty stdout', async () => {
    mockCliResult('');
    await expect(runClaudeTask(baseInput)).rejects.toThrow(/empty stdout/);
  });

  it('throws on a non-JSON envelope', async () => {
    mockCliResult('not json at all');
    await expect(runClaudeTask(baseInput)).rejects.toThrow(/non-JSON output/);
  });

  it('throws when the envelope carries no usable report, flagging is_error', async () => {
    mockCliResult(envelope('I could not do that.', { is_error: true }));
    await expect(runClaudeTask(baseInput)).rejects.toThrow(/no usable report \(is_error\)/);
  });
});
