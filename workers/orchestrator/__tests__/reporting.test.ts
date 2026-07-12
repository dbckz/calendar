import { formatComment } from '../reporting';

describe('formatComment', () => {
  it('builds readable plain text and rich html output', () => {
    const comment = formatComment('Research https://example.com and summarise it', {
      status: 'successful',
      summary: 'Pulled together a short explanation of the programme.',
      outputs: ['https://example.com/apply', 'Shortlist: step 1, step 2'],
      next: 'Review the summary and decide whether to apply.',
    });

    expect(comment.text).toMatch(/^Container: Research https:\/\/example\.com and summarise it\nStatus: 🟢 successful\n\nQuick take:\n- Pulled together a short explanation of the programme\.\n\nWhat you need to do:\n- Review the summary and decide whether to apply\.\n\nOutputs:\n- https:\/\/example\.com\/apply\n- Shortlist: step 1, step 2$/);
    expect(comment.htmlText).toMatch(/<strong>Container:<\/strong> Research <a href="https:\/\/example\.com">https:\/\/example\.com<\/a> and summarise it/);
    expect(comment.htmlText).toMatch(/<strong>Status:<\/strong> 🟢 successful/);
    expect(comment.htmlText).toMatch(/<p><strong>Outputs:<\/strong><\/p><ul><li><a href="https:\/\/example\.com\/apply">https:\/\/example\.com\/apply<\/a><\/li><li>Shortlist: step 1, step 2<\/li><\/ul>/);
    expect(comment.htmlText).toMatch(/^<body>[\s\S]*<\/body>$/);
    expect(comment.text).not.toMatch(/~ Task:/);
  });

  it('falls back cleanly for failed reports without outputs', () => {
    const comment = formatComment('~unknown-skill', {
      status: 'failed',
      summary: 'Unknown skill container: ~unknown-skill',
      outputs: [],
      next: '',
    });

    expect(comment.text).toMatch(/Status: 🔴 failed/);
    expect(comment.text).toMatch(/\nOutputs:\n- none$/);
    expect(comment.text).toMatch(/What you need to do:\n- Review the task and decide the next action\./);
  });

  it('expands multiline outputs into separate bullets', () => {
    const comment = formatComment('Draft outreach', {
      status: 'successful',
      summary: 'Created a draft message.',
      outputs: ['First paragraph.\n\nSecond paragraph.\n\nBest,\nDave'],
      next: 'Review it.',
    });

    expect(comment.text).toMatch(/Outputs:\n- First paragraph\.\n- Second paragraph\.\n- Best, Dave$/);
    expect(comment.htmlText).toMatch(/<p><strong>Outputs:<\/strong><\/p><ul><li>First paragraph\.<\/li><li>Second paragraph\.<\/li><li>Best, Dave<\/li><\/ul>/);
  });
});
