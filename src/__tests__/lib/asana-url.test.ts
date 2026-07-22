import { asanaTaskGidsFromText } from '@/lib/asana-url';

describe('asanaTaskGidsFromText', () => {
  it('extracts the gid from a single task URL', () => {
    const text = 'See https://app.asana.com/0/0/1234567890/f for details.';
    expect(asanaTaskGidsFromText(text)).toEqual(['1234567890']);
  });

  it('extracts distinct gids from multiple task URLs in order', () => {
    const text = [
      'Item A: https://app.asana.com/0/0/111/f',
      'Item B: https://app.asana.com/0/999888/222/f',
    ].join('\n');
    expect(asanaTaskGidsFromText(text)).toEqual(['111', '222']);
  });

  it('dedupes repeated URLs preserving first-seen order', () => {
    const text = [
      'https://app.asana.com/0/0/333/f',
      'https://app.asana.com/0/0/444/f',
      'https://app.asana.com/0/0/333/f',
    ].join('\n');
    expect(asanaTaskGidsFromText(text)).toEqual(['333', '444']);
  });

  it('returns an empty array for text without task URLs', () => {
    expect(asanaTaskGidsFromText('Just a plain description with no links.')).toEqual([]);
  });

  it('returns an empty array for empty string', () => {
    expect(asanaTaskGidsFromText('')).toEqual([]);
  });
});
