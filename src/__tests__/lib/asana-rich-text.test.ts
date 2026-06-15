import { commentToAsanaHtmlText } from '@/lib/asana-rich-text';

describe('commentToAsanaHtmlText', () => {
  it('renders section headings and bullet lists as rich text', () => {
    const input = `Quick take:

I reran the flight search.

What you need to do:

- Pick Option 1
- Ignore Option 3

Recommendation:

- **Option 1** is the cleanest`;

    expect(commentToAsanaHtmlText(input)).toBe(
      '<body><strong>Quick take:</strong><ul><li>I reran the flight search.</li></ul>\n<strong>What you need to do:</strong><ul><li>Pick Option 1</li><li>Ignore Option 3</li></ul>\n<strong>Recommendation:</strong><ul><li><strong>Option 1</strong> is the cleanest</li></ul></body>'
    );
  });

  it('renders container and status as consecutive metadata lines', () => {
    const input = `Container: ~flight-finder
Status: 🟢 successful

Quick take:

- Test run complete`;

    expect(commentToAsanaHtmlText(input)).toBe(
      '<body><strong>Container:</strong> ~flight-finder\n<strong>Status:</strong> 🟢 successful\n\n<strong>Quick take:</strong><ul><li>Test run complete</li></ul></body>'
    );
  });

  it('escapes html and supports ordered lists', () => {
    const input = `Next:

1. Check <this>
2. Ship it`;

    expect(commentToAsanaHtmlText(input)).toBe(
      '<body><strong>Next:</strong><ol><li>Check &lt;this&gt;</li><li>Ship it</li></ol></body>'
    );
  });

  it('turns plain urls into links', () => {
    const input = `Context:

- URL: https://example.com/test`;

    expect(commentToAsanaHtmlText(input)).toBe(
      '<body><strong>Context:</strong><ul><li>URL: <a href="https://example.com/test">https://example.com/test</a></li></ul></body>'
    );
  });

  it('keeps the Baltimore-style layout stable', () => {
    const input = `Container: ~flight-finder
Status: 🟢 successful

Quick take:
- I reran the TPC26 Baltimore flight search.

What you need to do:
- Pick Option 1
- Pick Option 3 only if saving money matters more than convenience

Recommendation:
- Option 1 — £645 round trip

Context:
- Google Flights URL: https://example.com/flights`;

    expect(commentToAsanaHtmlText(input)).toBe(
      '<body><strong>Container:</strong> ~flight-finder\n<strong>Status:</strong> 🟢 successful\n\n<strong>Quick take:</strong><ul><li>I reran the TPC26 Baltimore flight search.</li></ul>\n<strong>What you need to do:</strong><ul><li>Pick Option 1</li><li>Pick Option 3 only if saving money matters more than convenience</li></ul>\n<strong>Recommendation:</strong><ul><li>Option 1 — £645 round trip</li></ul>\n<strong>Context:</strong><ul><li>Google Flights URL: <a href="https://example.com/flights">https://example.com/flights</a></li></ul></body>'
    );
  });
});
