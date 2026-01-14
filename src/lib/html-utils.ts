export function htmlToReadableText(html: string): string {
  if (!html) return '';

  let text = html;

  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div)>/gi, '\n\n');
  text = text.replace(/<li[^>]*>/gi, '\n• ');
  text = text.replace(/<\/li>/gi, '');
  text = text.replace(/<(ul|ol)[^>]*>/gi, '\n');
  text = text.replace(/<\/(ul|ol)>/gi, '\n');
  text = text.replace(/<h[1-6][^>]*>/gi, '\n\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = decodeHtmlEntities(text);
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n +/g, '\n');
  text = text.replace(/ +\n/g, '\n');

  return text.trim();
}

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&ndash;': '–',
  '&mdash;': '—',
  '&bull;': '•',
  '&hellip;': '…',
  '&copy;': '©',
  '&reg;': '®',
  '&trade;': '™',
};

function decodeHtmlEntities(text: string): string {
  let result = text;

  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    result = result.replace(new RegExp(entity, 'gi'), char);
  }

  result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
  result = result.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));

  return result;
}

export function containsHtml(text: string): boolean {
  return /<[^>]+>/.test(text);
}
