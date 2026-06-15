function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatInline(value: string): string {
  return escapeHtml(value.trim())
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
}

const BULLET_RE = /^[-*•]\s+/;
const ORDERED_RE = /^\d+[.)]\s+/;
const HEADING_RE = /:$/;
const METADATA_RE = /^([A-Za-z][A-Za-z0-9 /_-]*:)(?:\s+)(.+)$/;

function stripPrefix(lines: string[], prefix: RegExp): string[] {
  return lines.map(line => line.trim().replace(prefix, '')).filter(Boolean);
}

function isBulletBlock(lines: string[]): boolean {
  return lines.length > 0 && lines.every(line => BULLET_RE.test(line.trim()));
}

function isOrderedBlock(lines: string[]): boolean {
  return lines.length > 0 && lines.every(line => ORDERED_RE.test(line.trim()));
}

function renderList(tag: 'ul' | 'ol', items: string[]): string {
  return `<${tag}>${items.map(item => `<li>${formatInline(item)}</li>`).join('')}</${tag}>`;
}

// Render a block of lines as the appropriate list (bulleted, ordered, or
// single-item bullet wrapping the joined content).
function renderBlockAsList(lines: string[]): string {
  if (isBulletBlock(lines)) return renderList('ul', stripPrefix(lines, BULLET_RE));
  if (isOrderedBlock(lines)) return renderList('ol', stripPrefix(lines, ORDERED_RE));
  return renderList('ul', [lines.join(' ')]);
}

function parseMetadataLine(line: string): { label: string; value: string } | null {
  const match = line.trim().match(METADATA_RE);
  if (!match) return null;
  return { label: match[1], value: match[2] };
}

function isMetadataBlock(lines: string[]): boolean {
  return lines.length > 0 && lines.every(line => parseMetadataLine(line) !== null);
}

function renderMetadataBlock(lines: string[]): string {
  return lines
    .map(line => {
      const parsed = parseMetadataLine(line);
      if (!parsed) return formatInline(line);
      return `<strong>${escapeHtml(parsed.label)}</strong> ${formatInline(parsed.value)}`;
    })
    .join('\n');
}

// Render a heading line (escaped, without markdown processing so inline ** doesn't
// double-wrap when we add the outer <strong>).
function renderHeading(line: string): string {
  return `<strong>${escapeHtml(line.trim())}</strong>`;
}

export function commentToAsanaHtmlText(comment: string): string {
  const blocks = comment
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map(block => block.split('\n').map(line => line.trim()).filter(Boolean))
    .filter(block => block.length > 0);

  const parts: string[] = [];
  let firstPartIsMetadata = false;

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];

    if (i === 0 && isMetadataBlock(block)) {
      parts.push(renderMetadataBlock(block));
      firstPartIsMetadata = true;
      continue;
    }

    if (HEADING_RE.test(block[0])) {
      const heading = renderHeading(block[0]);
      const remaining = block.slice(1);

      if (remaining.length > 0) {
        parts.push(`${heading}${renderBlockAsList(remaining)}`);
        continue;
      }

      const next = blocks[i + 1];
      if (next) {
        parts.push(`${heading}${renderBlockAsList(next)}`);
        i += 1;
        continue;
      }

      parts.push(heading);
      continue;
    }

    parts.push(renderBlockAsList(block));
  }

  let body = '';
  for (let i = 0; i < parts.length; i += 1) {
    if (i === 0) {
      body = parts[i];
      continue;
    }
    const separator = firstPartIsMetadata && i === 1 ? '\n\n' : '\n';
    body += `${separator}${parts[i]}`;
  }

  return `<body>${body}</body>`;
}
