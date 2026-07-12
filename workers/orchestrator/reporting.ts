import type { ContainerReport } from './types';

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function linkifyAndEscape(value: unknown): string {
  const text = String(value);
  const urlPattern = /https?:\/\/[^\s<]+/g;
  let result = '';
  let lastIndex = 0;

  for (const match of text.matchAll(urlPattern)) {
    const url = match[0];
    const start = match.index ?? 0;
    result += escapeHtml(text.slice(lastIndex, start));
    const escapedUrl = escapeHtml(url);
    result += `<a href="${escapedUrl}">${escapedUrl}</a>`;
    lastIndex = start + url.length;
  }

  result += escapeHtml(text.slice(lastIndex));
  return result;
}

function statusDisplay(status: string): { icon: string; label: string } {
  return status === 'successful'
    ? { icon: '🟢', label: 'successful' }
    : { icon: '🔴', label: 'failed' };
}

function renderTextList(items: string[]): string {
  return items.map(item => `- ${item}`).join('\n');
}

function renderHtmlList(items: string[]): string {
  return `<ul>${items.map(item => `<li>${linkifyAndEscape(item)}</li>`).join('')}</ul>`;
}

function normalizeMultilineItems(items: string[]): string[] {
  return items.flatMap(item =>
    String(item)
      .split(/\n\s*\n/)
      .map(part => part.replace(/\s*\n\s*/g, ' ').trim())
      .filter(Boolean),
  );
}

export function formatComment(container: string, report: ContainerReport): { text: string; htmlText: string } {
  const { icon, label } = statusDisplay(report.status);
  const outputs = report.outputs.length ? normalizeMultilineItems(report.outputs) : ['none'];
  const nextSteps = report.next ? [report.next] : ['Review the task and decide the next action.'];

  const text = [
    `Container: ${container}`,
    `Status: ${icon} ${label}`,
    '',
    'Quick take:',
    `- ${report.summary}`,
    '',
    'What you need to do:',
    renderTextList(nextSteps),
    '',
    'Outputs:',
    renderTextList(outputs),
  ].join('\n');

  const htmlText = [
    '<body>',
    `<strong>Container:</strong> ${linkifyAndEscape(container)}<br><strong>Status:</strong> ${icon} ${escapeHtml(label)}`,
    '',
    `<p><strong>Quick take:</strong></p>${renderHtmlList([report.summary])}`,
    '',
    `<p><strong>What you need to do:</strong></p>${renderHtmlList(nextSteps)}`,
    '',
    `<p><strong>Outputs:</strong></p>${renderHtmlList(outputs)}`,
    '</body>',
  ].join('\n');

  return { text, htmlText };
}
