import { format, parseISO } from 'date-fns';

// Deterministic pastel colour per category (shared by the replan sections, the
// plan-week wizard and the daily-review list so a category reads the same across
// the app).
export const CATEGORY_COLORS = [
  { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-400' },
  { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-400' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-400' },
  { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-400' },
  { bg: 'bg-pink-100', text: 'text-pink-700', dot: 'bg-pink-400' },
  { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-400' },
];

export function categoryColor(category: string) {
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) | 0;
  return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length];
}

export function slotLabel(date: string, start: string): string {
  return `${format(parseISO(date), 'EEE MMM d')} ${start}`;
}

// Same shape as slotLabel but from an absolute ms instant, used where the actual
// (possibly dragged) event interval is known rather than a stored yyyy-MM-dd slot.
export function slotLabelMs(startMs: number): string {
  return format(new Date(startMs), 'EEE MMM d HH:mm');
}

// Short human duration, e.g. 90 → "1h30", 60 → "1h", 45 → "45m".
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h${m}`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export function titleLabel(titles: string[]): string {
  if (titles.length === 0) return 'Reserved time';
  if (titles.length === 1) return titles[0];
  return `${titles[0]} +${titles.length - 1} more`;
}
