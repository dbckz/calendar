// Durable attribution overrides for calendar events, matched by recurring series
// or exact title.
//
// Why this exists: googleEventAttributions attributes ONE event id. A recurring
// meeting mints a new instance id every week, so a per-instance attribution
// would need re-applying forever and would be lost the moment the reconcile
// rebuilt the day. A rule attributes the series once, and both the live path and
// the reconcile apply it identically.
//
// Precedence sits with the manual per-event attribution (tier 2): an explicit
// task link still wins, a rule beats the calendar the event happens to sit on,
// and a rule targeting 'none' forces the event to count toward nothing.

import { normalize } from '@/lib/capacity';
import type { EventAttributionRule } from '@/types';

// Dave's standing decisions, shipped in code so they apply on a fresh install
// with no seeding step. Stored rules are checked FIRST, so any of these can be
// overridden (including to 'none') without editing code.
export const DBC_ASANA_INTEGRATION_ID = '29e78568-0681-4acc-b6b0-a7ffa9d31230';

export const BUILT_IN_ATTRIBUTION_RULES: readonly EventAttributionRule[] = [
  {
    id: 'builtin-weekly-professional-planning',
    // Recurring, and on whichever calendar it was created on (it is not on a
    // workspace-mapped calendar, so without this it counts toward nothing).
    // Matched by title because the series id differs per account/copy.
    // "Weekly PERSONAL planning" is a different title and is deliberately not
    // matched — that one is not work.
    title: 'Weekly professional planning',
    asanaIntegrationId: DBC_ASANA_INTEGRATION_ID,
    note: 'Professional planning is DBC work wherever it sits.',
    createdAt: '2026-07-25T00:00:00.000Z',
  },
];

export interface RuleMatchable {
  title?: string;
  recurringEventId?: string;
}

// The workspace a rule assigns to this event: an Asana integration id, 'none'
// for "counts toward nothing", or undefined when no rule matches.
//
// Series id is the stronger signal, so series rules are considered first; title
// matching is whitespace- and case-insensitive (via the shared normalize) and
// must match the WHOLE title, so "Weekly professional planning prep" does not
// match "Weekly professional planning".
export function resolveAttributionRule(
  event: RuleMatchable,
  storedRules: readonly EventAttributionRule[] = []
): string | 'none' | undefined {
  const rules = [...storedRules, ...BUILT_IN_ATTRIBUTION_RULES];
  const title = event.title ? normalize(event.title) : undefined;

  if (event.recurringEventId) {
    const bySeries = rules.find(r => r.recurringEventId === event.recurringEventId);
    if (bySeries) return bySeries.asanaIntegrationId;
  }
  if (title) {
    const byTitle = rules.find(r => r.title && normalize(r.title) === title);
    if (byTitle) return byTitle.asanaIntegrationId;
  }
  return undefined;
}
