// Client-side ETA estimator for queued delegation entries.
//
// Mirrors the launchd pacer (workers/orchestrator/orchestrator.ts drainOnce):
// it ticks every ~10 minutes and runs at most one queued entry per tick,
// oldest-first, gated by a rolling hourly cap (tiered day/night) and a rolling
// 24h daily backstop, and skipped entirely while a usage-limit `pausedUntil`
// backoff is in effect. We replay that logic forward from `now`, seeded with
// recent real run timestamps, to estimate when each queued entry will start.
//
// This is intentionally an estimate: minute-resolution, ignores the exact
// launchd tick phase, and assumes runs are instantaneous within a tick. It is
// meant to be honest, not exact.

import type { AgentPacingConfig } from '@/lib/workflow-config-storage';

const TICK_MS = 10 * 60 * 1000; // pacer cadence: one tick every 10 minutes
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// Safety horizon so a huge queue / tiny budget can't loop forever (~14 days).
const MAX_TICKS = 14 * 24 * 6;

// Whether `at`'s local wall-clock time falls inside the window. Matches the
// orchestrator's isWithinWindow, including windows that wrap past midnight
// (start > end, e.g. 07:00-01:00).
function isWithinWindow(window: { start: string; end: string } | undefined, at: Date): boolean {
  if (!window) return false;
  const [sh, sm] = window.start.split(':').map(Number);
  const [eh, em] = window.end.split(':').map(Number);
  const mins = at.getHours() * 60 + at.getMinutes();
  const start = sh * 60 + (sm || 0);
  const end = eh * 60 + (em || 0);
  return start <= end ? mins >= start && mins < end : mins >= start || mins < end;
}

// The hourly cap in effect at `at`: daytime `maxRunsPerHour` inside activeHours,
// else `sleepMaxRunsPerHour` (falling back to the daytime cap when unset).
// Mirrors orchestrator.ts effectiveHourlyCap.
export function effectiveHourlyCap(pacing: AgentPacingConfig, at: Date): number {
  if (!pacing.activeHours) return pacing.maxRunsPerHour;
  return isWithinWindow(pacing.activeHours, at)
    ? pacing.maxRunsPerHour
    : (pacing.sleepMaxRunsPerHour ?? pacing.maxRunsPerHour);
}

export interface EstimateQueueEtasInput {
  // Queued entries in the exact order the pacer claims them (priority asc, then
  // enqueuedAt asc). Only the GID is needed.
  orderedQueued: Array<{ asanaTaskGid: string }>;
  pacing: AgentPacingConfig;
  now: Date;
  // Usage-limit backoff instant (ISO); ticks before it are skipped entirely.
  pausedUntil?: string | null;
  // Epoch-ms timestamps of recent real runs (from orchestrator status history),
  // used to seed the rolling hourly/daily windows so early estimates account
  // for budget already spent.
  recentRunTimes?: number[];
}

// Returns a map of GID -> estimated start Date. Entries that can't be scheduled
// within the horizon are omitted (caller shows no ETA for them).
export function estimateQueueEtas(input: EstimateQueueEtasInput): Map<string, Date> {
  const { orderedQueued, pacing, now, pausedUntil, recentRunTimes } = input;
  const etas = new Map<string, Date>();
  if (orderedQueued.length === 0) return etas;

  const pausedUntilMs = pausedUntil ? Date.parse(pausedUntil) : NaN;
  // Combined real + simulated run instants driving the rolling windows.
  const runTimes: number[] = recentRunTimes ? [...recentRunTimes] : [];

  let idx = 0;
  let t = now.getTime();
  for (let tick = 0; tick < MAX_TICKS && idx < orderedQueued.length; tick++, t += TICK_MS) {
    // Hold everything until the usage-limit backoff clears.
    if (!Number.isNaN(pausedUntilMs) && t < pausedUntilMs) continue;

    const at = new Date(t);
    // Rolling windows use the pacer's strict "less than" comparison.
    const inHour = runTimes.reduce((n, r) => (t - r < HOUR_MS ? n + 1 : n), 0);
    if (inHour >= effectiveHourlyCap(pacing, at)) continue;
    const inDay = runTimes.reduce((n, r) => (t - r < DAY_MS ? n + 1 : n), 0);
    if (inDay >= pacing.maxRunsPerDay) continue;

    // Budget allows a run this tick: assign the next queued entry.
    etas.set(orderedQueued[idx].asanaTaskGid, at);
    runTimes.push(t);
    idx++;
  }

  return etas;
}
