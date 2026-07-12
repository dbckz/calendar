import { extractStructuredReportFromText } from '../openclaw-runner';

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
