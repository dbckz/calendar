export function pct(rate: number): number {
  return Math.min(100, Math.round(rate * 100));
}

export function formatMinutes(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded}m`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

// Fixed palette for the categories the scheduler actually emits, so a category
// keeps its colour from week to week and across workspaces. Anything unknown
// falls back to a hash of the name — arbitrary, but stable for the same name.
const CATEGORY_COLOURS: Record<string, string> = {
  Meetings: 'bg-sky-500',
  'Writing/Deep Work': 'bg-violet-500',
  Emails: 'bg-amber-500',
  Admin: 'bg-slate-400',
  Policy: 'bg-rose-500',
  Research: 'bg-teal-500',
  Other: 'bg-gray-300',
  Uncategorised: 'bg-gray-300',
  // Time recorded before category tracking existed: grey, like the other
  // "we don't know" buckets, so it never reads as a real category.
  Unsplit: 'bg-gray-300',
};

const FALLBACK_COLOURS = [
  'bg-indigo-500',
  'bg-emerald-500',
  'bg-orange-500',
  'bg-cyan-500',
  'bg-fuchsia-500',
  'bg-lime-500',
];

export function categoryColour(category: string): string {
  const known = CATEGORY_COLOURS[category];
  if (known) return known;
  let hash = 0;
  for (let i = 0; i < category.length; i += 1) hash = (hash * 31 + category.charCodeAt(i)) % 9973;
  return FALLBACK_COLOURS[hash % FALLBACK_COLOURS.length];
}
