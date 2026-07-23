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

// A CapacityBlock paired with the Google event id its source record points at.
export interface EventScopedBlock {
  googleEventId?: string | null;
  block: CapacityBlock;
}

// Collapse records sharing a Google event id into ONE block. Grouped categories
// (e.g. Batch, Engagement) store one record per agenda task, all pointing at the
// SAME container event; the weekly quota counts BLOCKS, not tasks. Unlike a
// plain dedupe — which kept only the FIRST record's fields — we UNION the type
// signals across EVERY member. That matters because a member task that has been
// completed drops out of the live Asana fetch and carries no type signal; if the
// first member happens to be that completed task, keeping only its (empty)
// signal left the whole block unclassified and uncounted. Merging lets any
// member's type classify the block. The block counts as completed only when
// EVERY member task is done; its minutes are the first member's (the container
// event's duration), matching the prior dedupe behavior. Records with no event
// id are each their own block.
export function mergeBlocksByEventId(records: EventScopedBlock[]): CapacityBlock[] {
  const byEvent = new Map<string, CapacityBlock>();
  const result: CapacityBlock[] = [];
  for (const { googleEventId, block } of records) {
    if (!googleEventId) {
      // No-event blocks are never merged into later, so no defensive clone.
      result.push(block);
      continue;
    }
    const existing = byEvent.get(googleEventId);
    if (!existing) {
      const merged: CapacityBlock = { ...block, typeSignals: [...block.typeSignals] };
      byEvent.set(googleEventId, merged);
      result.push(merged);
    } else {
      existing.typeSignals.push(...block.typeSignals);
      existing.completed = existing.completed && block.completed;
    }
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
