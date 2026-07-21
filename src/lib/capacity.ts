// Pure capacity-computation logic for the Command Center dashboard.
// Kept free of I/O so it can be unit-tested in isolation. The dashboard route
// builds the inputs (from workflow-config quotas + scheduled/ad-hoc blocks) and
// calls computeCapacity to produce the per-category rows the widget renders.

export interface CapacityQuota {
  category: string;
  weeklyCount?: number;
  targetLength: string; // e.g. "2h", "1.5h", "45min", "1h 30min"
  types: string[]; // typeMapping[category] - task types that count toward this category
}

export interface CapacityBlock {
  // Type signals associated with the block. For an Asana task this is its
  // "Type" custom field value; for an ad-hoc task, its taskType id and label.
  typeSignals: string[];
  minutes: number;
  completed: boolean;
}

export interface CapacityRow {
  category: string;
  weeklyCount: number;
  scheduledCount: number;
  completedCount: number;
  scheduledMinutes: number;
  targetMinutes: number;
}

// Parse a human target length like "2h", "1.5h", "90min", "1h 30min" into minutes.
export function parseTargetLength(input: string | undefined): number {
  if (!input) return 0;
  let minutes = 0;
  const hourMatch = input.match(/(\d+(?:\.\d+)?)\s*h/i);
  if (hourMatch) minutes += parseFloat(hourMatch[1]) * 60;
  const minMatch = input.match(/(\d+(?:\.\d+)?)\s*(?:min|m)\b/i);
  if (minMatch) minutes += parseFloat(minMatch[1]);
  // Bare number with no unit -> treat as minutes
  if (!hourMatch && !minMatch) {
    const bare = parseFloat(input);
    if (!Number.isNaN(bare)) minutes = bare;
  }
  return Math.round(minutes);
}

// Normalize a type/category label for comparison. Insignificant whitespace
// differences shouldn't matter: an Asana Type "Writing / Deep Work" must match
// the config category "Writing/Deep Work". So we lowercase, trim, drop spaces
// around slashes, and collapse whitespace runs to a single space.
export function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ');
}

// Return the first category a block's type signals map to, or null.
// A signal matches a category if it equals one of the category's mapped types
// (case-insensitively) or equals the category name directly.
export function classifyBlockCategory(
  typeSignals: string[],
  quotas: CapacityQuota[]
): string | null {
  const signals = new Set(typeSignals.filter(Boolean).map(normalize));
  if (signals.size === 0) return null;

  for (const quota of quotas) {
    if (signals.has(normalize(quota.category))) return quota.category;
    for (const type of quota.types) {
      if (signals.has(normalize(type))) return quota.category;
    }
  }
  return null;
}

// The "catch-all" category, if the config defines one: a category with no weekly
// quota (weeklyCount falsy) AND no mapped types (empty list). It exists to absorb
// whatever matches nothing else — e.g. "General Todos". Returns its name or null.
// Multiple such categories would be unusual; the first in quota order wins.
export function findCatchAllCategory(quotas: CapacityQuota[]): string | null {
  const catchAll = quotas.find(q => !q.weeklyCount && q.types.length === 0);
  return catchAll ? catchAll.category : null;
}

// Classify a block's type signals to a category, falling back to the config's
// catch-all category (see findCatchAllCategory) when nothing else matches. This
// is what the "Plan my week" selection pipeline uses so a task that maps to no
// explicit category is still routed to the catch-all (e.g. "General Todos") in
// EVERY path — the candidates display, the propose selection filter, and the
// engine's bucketing — rather than being silently dropped. Kept separate from
// classifyBlockCategory (which stays a pure "does it match" check) so the
// dashboard capacity view is unaffected.
export function classifyBlockCategoryWithCatchAll(
  typeSignals: string[],
  quotas: CapacityQuota[]
): string | null {
  return classifyBlockCategory(typeSignals, quotas) ?? findCatchAllCategory(quotas);
}

// Resolve the "Plan my week" wizard's selection cap for a category: how many
// tasks the user may still select this week, or null for "pick any" (unlimited).
//   * An explicit maxSelection caps selection at (maxSelection - already
//     scheduled this week), floored at 0, and TAKES PRECEDENCE over the
//     grouped/no-quota "pick any" behavior — so a grouped category (e.g. Deep
//     Work) can still be capped at "up to N". The wizard never lifts this cap.
//   * Otherwise a no-quota catch-all or a grouped category is uncapped (null).
//   * A plain quota'd category caps at its unmet weekly quota.
export function resolveSelectionCap(opts: {
  weeklyCount?: number;
  grouped?: boolean;
  maxSelection?: number;
  existing: number;
}): number | null {
  const { weeklyCount = 0, grouped, maxSelection, existing } = opts;
  if (typeof maxSelection === 'number') return Math.max(0, maxSelection - existing);
  if (weeklyCount <= 0 || grouped) return null;
  return Math.max(0, weeklyCount - existing);
}

// Dedupe records so a grouped block counts once toward its quota. Grouped
// categories (e.g. Writing/Deep Work, Engagement/Outreach) store one scheduled
// record per agenda task, all pointing at the SAME Google event; the weekly
// quota counts BLOCKS, not tasks. So records sharing a Google event id collapse
// to their first occurrence, while records with no event id (each its own
// block) always pass through. Used by both the dashboard capacity route and
// gatherWeekContext so counting stays identical.
export function dedupeByEventId<T>(
  items: T[],
  getEventId: (item: T) => string | null | undefined
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const eventId = getEventId(item);
    if (eventId) {
      if (seen.has(eventId)) continue;
      seen.add(eventId);
    }
    result.push(item);
  }
  return result;
}

export function computeCapacity(
  quotas: CapacityQuota[],
  blocks: CapacityBlock[]
): CapacityRow[] {
  const rows: Record<string, CapacityRow> = {};
  for (const quota of quotas) {
    const perBlockMinutes = parseTargetLength(quota.targetLength);
    const weeklyCount = quota.weeklyCount ?? 0;
    rows[quota.category] = {
      category: quota.category,
      weeklyCount,
      scheduledCount: 0,
      completedCount: 0,
      scheduledMinutes: 0,
      targetMinutes: perBlockMinutes * weeklyCount,
    };
  }

  for (const block of blocks) {
    const category = classifyBlockCategory(block.typeSignals, quotas);
    if (!category) continue;
    const row = rows[category];
    row.scheduledCount += 1;
    row.scheduledMinutes += block.minutes;
    if (block.completed) row.completedCount += 1;
  }

  return quotas.map(q => rows[q.category]);
}
