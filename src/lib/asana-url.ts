// The Asana permalink for a task gid. Asana's canonical task URL
// ("https://app.asana.com/0/0/<gid>/f") resolves to the task regardless of the
// project it lives in, so we can build it from the gid alone without a stored
// permalink. Rendered as a plain URL in Google Calendar event descriptions,
// which Google auto-links. Dependency-free so both server (scheduling lib) and
// client (sidebar drag-to-schedule) share one source of truth.
export function asanaTaskUrl(gid: string): string {
  return `https://app.asana.com/0/0/${gid}/f`;
}
