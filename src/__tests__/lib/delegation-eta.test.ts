import { estimateQueueEtas, effectiveHourlyCap } from '@/lib/delegation-eta';
import type { AgentPacingConfig } from '@/lib/workflow-config-storage';

// Pacing matching production: 2/h daytime (07:00-01:00), 6/h overnight, 40/day.
const PACING: AgentPacingConfig = {
  maxRunsPerHour: 2,
  sleepMaxRunsPerHour: 6,
  maxRunsPerDay: 40,
  activeHours: { start: '07:00', end: '01:00' },
};

// Build queued entries whose GIDs make ordering obvious.
function queued(n: number): Array<{ asanaTaskGid: string }> {
  return Array.from({ length: n }, (_, i) => ({ asanaTaskGid: `t${i}` }));
}

describe('effectiveHourlyCap', () => {
  it('uses the daytime cap inside active hours', () => {
    expect(effectiveHourlyCap(PACING, new Date('2026-07-23T12:00:00'))).toBe(2);
  });

  it('uses the overnight cap outside active hours (window wraps midnight)', () => {
    // 03:00 is inside the overnight gap (01:00-07:00).
    expect(effectiveHourlyCap(PACING, new Date('2026-07-23T03:00:00'))).toBe(6);
  });

  it('falls back to the flat rate when no activeHours are set', () => {
    expect(effectiveHourlyCap({ maxRunsPerHour: 3, maxRunsPerDay: 10 }, new Date())).toBe(3);
  });
});

describe('estimateQueueEtas', () => {
  it('paces at the daytime cap: 2 runs per rolling hour', () => {
    // Midday, no prior runs. With a 10-min tick and a rolling 60-min window
    // capped at 2, the first two entries run immediately (ticks 0 and 10min),
    // then the window is full until the first run ages out an hour later.
    const now = new Date('2026-07-23T12:00:00');
    const etas = estimateQueueEtas({ orderedQueued: queued(3), pacing: PACING, now });

    expect(etas.get('t0')!.getTime()).toBe(now.getTime());
    expect(etas.get('t1')!.getTime()).toBe(now.getTime() + 10 * 60_000);
    // Third run waits until t0 leaves the 60-min window (t0 + 60min).
    expect(etas.get('t2')!.getTime()).toBe(now.getTime() + 60 * 60_000);
  });

  it('drains faster once the clock crosses into the overnight window', () => {
    // Start at 00:40 (daytime cap 2/h). After 01:00 the cap jumps to 6/h, so
    // the tail of the queue drains at roughly one per 10-min tick.
    const now = new Date('2026-07-23T00:40:00');
    const etas = estimateQueueEtas({ orderedQueued: queued(8), pacing: PACING, now });

    // Every queued entry gets an estimate...
    for (let i = 0; i < 8; i++) expect(etas.has(`t${i}`)).toBe(true);
    // ...and the later ones land in the overnight window (>= 01:00), pacing
    // at the higher rate rather than the daytime 2/h.
    const overnight = [...etas.values()].filter(d => d.getHours() >= 1 && d.getHours() < 7);
    expect(overnight.length).toBeGreaterThanOrEqual(4);
  });

  it('holds all estimates until a pausedUntil backoff clears', () => {
    const now = new Date('2026-07-23T12:00:00');
    const pausedUntil = new Date('2026-07-23T14:00:00').toISOString();
    const etas = estimateQueueEtas({ orderedQueued: queued(2), pacing: PACING, now, pausedUntil });

    // Nothing runs before the pause lifts.
    expect(etas.get('t0')!.getTime()).toBeGreaterThanOrEqual(Date.parse(pausedUntil));
    expect(etas.get('t1')!.getTime()).toBeGreaterThanOrEqual(Date.parse(pausedUntil));
  });

  it('pushes past the daily cap into the next day', () => {
    // A tiny daily cap that is already exhausted by recent runs: the next entry
    // can only run once one of those runs ages out of the rolling 24h window.
    const now = new Date('2026-07-23T12:00:00');
    const pacing: AgentPacingConfig = { maxRunsPerHour: 10, maxRunsPerDay: 2 };
    // Two runs in the last 24h (11h and 1h ago) already fill the daily budget.
    const recentRunTimes = [
      now.getTime() - 11 * 60 * 60_000,
      now.getTime() - 1 * 60 * 60_000,
    ];
    const etas = estimateQueueEtas({ orderedQueued: queued(1), pacing, now, recentRunTimes });

    const t0 = etas.get('t0')!;
    // The oldest run ages out 24h after it happened (13h from now), so the entry
    // can't start before then — i.e. it's pushed into the next day.
    expect(t0.getTime()).toBeGreaterThanOrEqual(now.getTime() + 13 * 60 * 60_000);
  });

  it('returns an empty map for an empty queue', () => {
    expect(estimateQueueEtas({ orderedQueued: [], pacing: PACING, now: new Date() }).size).toBe(0);
  });
});
