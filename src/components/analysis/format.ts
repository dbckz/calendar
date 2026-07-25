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
// keeps its colour from week to week and across workspaces. The eight main
// slots are a CVD-validated categorical set (adjacent-pair ΔE checked in OKLab);
// the three weekly rituals get their own distinct steps. Colours are never
// generated or cycled — an unknown category renders grey alongside the other
// "we don't know" buckets rather than risking a collision with a real one.
const UNKNOWN_COLOUR = '#d1d5db';

const CATEGORY_COLOURS: Record<string, string> = {
  Meetings: '#2a78d6',
  'Engagement/Outreach': '#eb6834',
  Batch: '#1baf7a',
  Emails: '#eda100',
  Blogs: '#e87ba4',
  'General Todos': '#008300',
  'Writing/Deep Work': '#4a3aa7',
  'Meeting prep': '#e34948',
  'Kindle notes': '#8c5a2b',
  'Backlog grooming': '#0e7490',
  Retrospective: '#64748b',
  Other: UNKNOWN_COLOUR,
  Uncategorised: UNKNOWN_COLOUR,
  // Time recorded before category tracking existed.
  Unsplit: UNKNOWN_COLOUR,
};

export function categoryColour(category: string): string {
  return CATEGORY_COLOURS[category] ?? UNKNOWN_COLOUR;
}
