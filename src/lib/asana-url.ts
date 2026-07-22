// The Asana permalink for a task gid. Asana's canonical task URL
// ("https://app.asana.com/0/0/<gid>/f") resolves to the task regardless of the
// project it lives in, so we can build it from the gid alone without a stored
// permalink. Rendered as a plain URL in Google Calendar event descriptions,
// which Google auto-links. Dependency-free so both server (scheduling lib) and
// client (sidebar drag-to-schedule) share one source of truth.
export function asanaTaskUrl(gid: string): string {
  return `https://app.asana.com/0/0/${gid}/f`;
}

// Extract the distinct Asana task gids referenced by URLs in free text (e.g. a
// Google Calendar event description). Matches the canonical permalink shape
// "app.asana.com/0/<project>/<gid>" — the gid is the last numeric path segment
// after the project segment; the planner writes "/0/0/<gid>/f". Returns gids in
// first-seen order with duplicates removed, so a grouped block with the same
// task URL twice yields it once.
export function asanaTaskGidsFromText(text: string): string[] {
  const re = /app\.asana\.com\/0\/\d+\/(\d+)/g;
  const gids: string[] = [];
  for (const match of text.matchAll(re)) {
    const gid = match[1];
    if (!gids.includes(gid)) gids.push(gid);
  }
  return gids;
}
