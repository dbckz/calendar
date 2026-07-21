/**
 * Tests for the pure "Mid-week replan" logic.
 * All Dates are built with the local Date constructor so the tests are
 * timezone-independent.
 */
import { planReplan, type ReplanBlock } from '@/lib/scheduling/replan';
import type { BusyInterval } from '@/lib/scheduling/types';
import type { WorkflowConfig } from '@/lib/workflow-config-storage';

const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEK_START = new Date(2026, 6, 13, 0, 0, 0, 0); // Monday 2026-07-13

function makeConfig(overrides: {
  quotas?: WorkflowConfig['taskQuotas'];
  scheduling?: Partial<WorkflowConfig['scheduling']>;
} = {}): WorkflowConfig {
  return {
    taskQuotas: overrides.quotas ?? {
      Deep: { weeklyCount: 2, targetLength: '1h', preferredTimes: ['09:00-11:00'] },
    },
    typeMapping: { Deep: ['deep'] },
    scheduling: {
      bufferBetweenTasks: '0min',
      workingDays: ALL_DAYS,
      workingHours: { start: '09:00', end: '17:00' },
      ...overrides.scheduling,
    },
    lastUpdated: '2026-07-12T00:00:00.000Z',
  };
}

// Build a block from a local date + start; startMs/endMs are derived so the
// block's "actual" interval matches its stored schedule.
function block(o: Partial<ReplanBlock> & { date: string; start: string }): ReplanBlock {
  const dur = o.durationMinutes ?? 60;
  const [y, mo, d] = o.date.split('-').map(Number);
  const [h, m] = o.start.split(':').map(Number);
  const startMs = new Date(y, mo - 1, d, h, m, 0, 0).getTime();
  return {
    googleEventId: 'evt',
    googleIntegrationId: 'g1',
    category: 'Deep',
    titles: ['Task'],
    done: false,
    durationMinutes: dur,
    startMs,
    endMs: startMs + dur * 60 * 1000,
    ...o,
  };
}

function busy(d: number, h1: number, m1: number, h2: number, m2: number): BusyInterval {
  return { start: new Date(2026, 6, d, h1, m1), end: new Date(2026, 6, d, h2, m2) };
}

function run(o: {
  blocks: ReplanBlock[];
  otherBusy?: BusyInterval[];
  now: Date;
  config?: WorkflowConfig;
}) {
  return planReplan({
    config: o.config ?? makeConfig(),
    weekStart: WEEK_START,
    now: o.now,
    blocks: o.blocks,
    otherBusy: o.otherBusy ?? [],
  });
}

const WED_8AM = new Date(2026, 6, 15, 8, 0, 0, 0); // Wednesday 08:00

describe('planReplan - classification', () => {
  it('classifies a past, incomplete block as missed and re-slots it', () => {
    const { kept, moves, unplaceable } = run({
      blocks: [block({ googleEventId: 'a', date: '2026-07-13', start: '09:00' })], // Monday
      now: WED_8AM,
    });
    expect(kept).toHaveLength(0);
    expect(unplaceable).toHaveLength(0);
    expect(moves).toHaveLength(1);
    expect(moves[0].reason).toBe('missed');
    expect(moves[0].googleEventId).toBe('a');
    expect(moves[0].oldDate).toBe('2026-07-13');
    expect(moves[0].newDate).toBe('2026-07-15'); // Wednesday, first remaining day
    expect(moves[0].newStart).toBe('09:00'); // deep preferred window 09:00-11:00
  });

  it('keeps a past block whose linked work is already done', () => {
    const { kept, moves } = run({
      blocks: [block({ date: '2026-07-13', start: '09:00', done: true })],
      now: WED_8AM,
    });
    expect(moves).toHaveLength(0);
    expect(kept).toHaveLength(1);
  });

  it('classifies a future block overlapping a real meeting as conflicted', () => {
    const { moves } = run({
      blocks: [block({ googleEventId: 'c', date: '2026-07-15', start: '14:00' })], // future
      otherBusy: [busy(15, 14, 0, 15, 0)], // meeting overlapping the block
      now: WED_8AM,
    });
    expect(moves).toHaveLength(1);
    expect(moves[0].reason).toBe('conflict');
    expect(moves[0].newStart).toBe('09:00'); // re-slotted into the free preferred window
    expect(moves[0].newDate).toBe('2026-07-15');
  });

  it('does not treat two app blocks overlapping each other as a conflict', () => {
    // Only otherBusy (real events) can trigger a conflict; app blocks overlapping
    // each other must not, so both pass through as kept.
    const { kept, moves } = run({
      blocks: [
        block({ googleEventId: 'x', date: '2026-07-15', start: '14:00' }),
        block({ googleEventId: 'y', date: '2026-07-15', start: '14:30' }),
      ],
      otherBusy: [],
      now: WED_8AM,
    });
    expect(moves).toHaveLength(0);
    expect(kept).toHaveLength(2);
  });

  it('keeps a future block with no conflict untouched', () => {
    const { kept, moves, unplaceable } = run({
      blocks: [block({ googleEventId: 'k', date: '2026-07-16', start: '10:00' })], // Thursday, future
      now: WED_8AM,
    });
    expect(moves).toHaveLength(0);
    expect(unplaceable).toHaveLength(0);
    expect(kept).toHaveLength(1);
    expect(kept[0].googleEventId).toBe('k');
  });
});

describe('planReplan - re-slotting', () => {
  it('preserves each moving block’s duration and category', () => {
    const { moves } = run({
      blocks: [block({ date: '2026-07-13', start: '09:00', category: 'Deep', durationMinutes: 90 })],
      now: WED_8AM,
    });
    expect(moves).toHaveLength(1);
    expect(moves[0].category).toBe('Deep');
    expect(moves[0].durationMinutes).toBe(90);
    expect(moves[0].newStart).toBe('09:00'); // 90 mins fits in 09:00-11:00
  });

  it('re-slots a same-day missed block, ignoring its own past interval', () => {
    // A block earlier today (06:00-07:00) has already ended. Today is still a
    // remaining working day; its own past interval must not block re-placement
    // into today's preferred window.
    const { moves } = run({
      blocks: [block({ date: '2026-07-15', start: '06:00' })],
      now: WED_8AM,
    });
    expect(moves).toHaveLength(1);
    expect(moves[0].reason).toBe('missed');
    expect(moves[0].newDate).toBe('2026-07-15');
    expect(moves[0].newStart).toBe('09:00');
  });

  it('places two movers into distinct non-overlapping slots', () => {
    const config = makeConfig({
      quotas: { Deep: { weeklyCount: 2, targetLength: '1h', preferredTimes: ['09:00-11:00'] } },
      scheduling: { workingDays: ['Wednesday'], workingHours: { start: '09:00', end: '11:00' } },
    });
    const { moves, unplaceable } = run({
      blocks: [
        block({ googleEventId: 'a', date: '2026-07-13', start: '09:00' }),
        block({ googleEventId: 'b', date: '2026-07-14', start: '09:00' }),
      ],
      now: WED_8AM,
      config,
    });
    expect(unplaceable).toHaveLength(0);
    expect(moves).toHaveLength(2);
    const starts = moves.map(m => m.newStart).sort();
    expect(starts).toEqual(['09:00', '10:00']);
    expect(moves.every(m => m.newDate === '2026-07-15')).toBe(true);
  });

  it('reports a block as unplaceable when the remaining week is full', () => {
    const config = makeConfig({
      quotas: { Deep: { weeklyCount: 1, targetLength: '1h', preferredTimes: ['09:00-10:00'] } },
      scheduling: { workingDays: ['Wednesday'], workingHours: { start: '09:00', end: '10:00' } },
    });
    const { moves, unplaceable } = run({
      blocks: [block({ googleEventId: 'a', date: '2026-07-13', start: '09:00' })],
      otherBusy: [busy(15, 9, 0, 10, 0)], // the single remaining slot is taken
      now: WED_8AM,
      config,
    });
    expect(moves).toHaveLength(0);
    expect(unplaceable).toHaveLength(1);
    expect(unplaceable[0].googleEventId).toBe('a');
    expect(unplaceable[0].reason).toBe('missed');
  });

  it('uses the afternoon default for a non-deep-work category with no preferred times', () => {
    const config = makeConfig({
      quotas: {
        Ops: { weeklyCount: 1, targetLength: '1h', preferredTimes: [] },
      },
    });
    const { moves } = run({
      blocks: [block({ date: '2026-07-13', start: '09:00', category: 'Ops' })],
      now: WED_8AM,
      config,
    });
    expect(moves).toHaveLength(1);
    expect(moves[0].newStart).toBe('12:00'); // afternoon default 12:00-17:00
  });

  it('keeps mornings for a deep-work category with no preferred times', () => {
    const config = makeConfig({
      quotas: {
        'Writing/Deep Work': { weeklyCount: 1, targetLength: '1h', preferredTimes: [] },
      },
    });
    const { moves } = run({
      blocks: [block({ date: '2026-07-13', start: '09:00', category: 'Writing/Deep Work' })],
      now: WED_8AM,
      config,
    });
    expect(moves).toHaveLength(1);
    expect(moves[0].newStart).toBe('09:00'); // deep work falls back to morning working hours
  });
});
