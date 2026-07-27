// Activity-filtered project catalogue for the reminders-triage classifier.
//
// The classifier is fed a catalogue of candidate Asana projects. A large
// workspace (e.g. 128 unarchived projects) mostly holds long-dormant projects,
// so we narrow the catalogue to recently-active projects plus manual overrides.
// This only trims what the AI SEES — the triage dropdowns still offer the full
// project list, so the user can file a reminder into anything by hand.

export interface TriageProjectFilterConfig {
  // Projects always offered to the classifier, regardless of activity.
  includeGids: string[];
  // Projects never offered to the classifier, regardless of activity.
  excludeGids: string[];
  // A project counts as "active" if modified within this many days.
  activeDays: number;
}

export const DEFAULT_TRIAGE_PROJECT_FILTER: TriageProjectFilterConfig = {
  includeGids: [],
  excludeGids: [],
  activeDays: 90,
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Whether a project belongs in the classifier catalogue. Rule:
//   include if (active within activeDays OR gid in includeGids)
//          and gid NOT in excludeGids.
// Exclude wins over include. A missing/unparsable modified_at fails open
// (treated as active) so we never hide a project just because Asana omitted a
// timestamp.
export function isProjectInTriageCatalogue(
  project: { gid: string; modifiedAt?: string },
  config: TriageProjectFilterConfig,
  now: Date = new Date()
): boolean {
  if (config.excludeGids.includes(project.gid)) return false;
  if (config.includeGids.includes(project.gid)) return true;
  if (!project.modifiedAt) return true;
  const modified = new Date(project.modifiedAt).getTime();
  if (Number.isNaN(modified)) return true;
  const cutoff = now.getTime() - config.activeDays * DAY_MS;
  return modified >= cutoff;
}
