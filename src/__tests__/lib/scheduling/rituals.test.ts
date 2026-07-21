/**
 * Tests for the pure daily-ritual (lunch + emails) block placer.
 * Dates use the local Date constructor so tests are timezone-independent.
 */
import {
  proposeRitualBlocks,
  placeWeekRituals,
  proposedBlockToBusyInterval,
  LUNCH_TITLE,
  EXERCISE_TITLE,
  EMAILS_TITLE,
} from '@/lib/scheduling/rituals';
import { proposePrepBlocks } from '@/lib/scheduling/prep';
import type { BusyInterval } from '@/lib/scheduling/types';
import type { WorkflowConfig } from '@/lib/workflow-config-storage';

const WEEK_START = new Date(2026, 6, 13, 0, 0, 0, 0); // Monday 2026-07-13

function makeConfig(overrides: Partial<WorkflowConfig['scheduling']> = {}): WorkflowConfig {
  return {
    taskQuotas: {},
    typeMapping: {},
    scheduling: {
      workRun: { maxMinutes: 120, bufferMinutes: 15 },
      workingDays: ['Monday'],
      workingHours: { start: '09:00', end: '17:00' },
      ...overrides,
    },
    lastUpdated: '2026-07-12T00:00:00.000Z',
  };
}

function run(input: {
  scheduling?: Partial<WorkflowConfig['scheduling']>;
  busyIntervals?: BusyInterval[];
  existingRitualTitlesByDate?: Record<string, Set<string>>;
  now?: Date;
}) {
  return proposeRitualBlocks({
    config: makeConfig(input.scheduling),
    busyIntervals: input.busyIntervals ?? [],
    weekStart: WEEK_START,
    now: input.now ?? WEEK_START,
    existingRitualTitlesByDate: input.existingRitualTitlesByDate ?? {},
  });
}

const busy = (h1: number, m1: number, h2: number, m2: number): BusyInterval => ({
  start: new Date(2026, 6, 13, h1, m1),
  end: new Date(2026, 6, 13, h2, m2),
});

describe('proposeRitualBlocks', () => {
  it('places a lunch in the 11:30–13:00 window and emails at the end of the day', () => {
    const blocks = run({});
    const lunch = blocks.find(b => b.title === LUNCH_TITLE);
    const emails = blocks.find(b => b.title === EMAILS_TITLE);

    expect(lunch).toBeDefined();
    expect(lunch!.kind).toBe('ritual');
    expect(lunch!.category).toBe('Lunch');
    expect(lunch!.durationMinutes).toBe(30);
    expect(lunch!.start).toBe('11:30'); // earliest free within the ideal window
    expect(lunch!.date).toBe('2026-07-13');

    expect(emails).toBeDefined();
    expect(emails!.category).toBe('Emails');
    expect(emails!.durationMinutes).toBe(30);
    // End of the day: last free 30-min slot in the final two hours (15:00–17:00).
    expect(emails!.start).toBe('16:30');
  });

  it('falls back to 11:00–14:00 when the ideal lunch window is busy', () => {
    // Block 11:30–13:00 entirely; lunch should fall back to a free slot 11:00–14:00.
    const blocks = run({ busyIntervals: [busy(11, 30, 13, 0)] });
    const lunch = blocks.find(b => b.title === LUNCH_TITLE);
    expect(lunch).toBeDefined();
    // 11:00 is free within the fallback window (before the 11:30 block).
    expect(lunch!.start).toBe('11:00');
  });

  it('skips lunch when nothing fits in 11:00–14:00', () => {
    const blocks = run({ busyIntervals: [busy(11, 0, 14, 0)] });
    expect(blocks.find(b => b.title === LUNCH_TITLE)).toBeUndefined();
    // Emails still fits at the end of the day.
    expect(blocks.find(b => b.title === EMAILS_TITLE)).toBeDefined();
  });

  it('dedupes: skips a ritual whose exact title already exists that day', () => {
    const blocks = run({
      existingRitualTitlesByDate: { '2026-07-13': new Set([LUNCH_TITLE]) },
    });
    // Lunch already present → not re-proposed; emails still proposed.
    expect(blocks.find(b => b.title === LUNCH_TITLE)).toBeUndefined();
    expect(blocks.find(b => b.title === EMAILS_TITLE)).toBeDefined();
  });

  it('does not double-book lunch and emails against each other', () => {
    // A tiny day (11:00–12:00 working hours) with room for only one 30-min ritual.
    const blocks = run({ scheduling: { workingHours: { start: '11:00', end: '12:00' } } });
    const starts = blocks.map(b => b.start);
    // No two rituals share a slot.
    expect(new Set(starts).size).toBe(starts.length);
  });

  it('skips emails when the afternoon is full', () => {
    const blocks = run({ busyIntervals: [busy(12, 0, 17, 0)] });
    expect(blocks.find(b => b.title === EMAILS_TITLE)).toBeUndefined();
  });

  it('places rituals on every working day', () => {
    const blocks = run({
      scheduling: { workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] },
    });
    const lunches = blocks.filter(b => b.title === LUNCH_TITLE);
    expect(lunches).toHaveLength(5);
    expect(new Set(lunches.map(l => l.date)).size).toBe(5);
  });

  it('places a 60-min exercise block starting at exactly 15:00 when free', () => {
    const blocks = run({ scheduling: { workingHours: { start: '08:30', end: '19:00' } } });
    const exercise = blocks.find(b => b.title === EXERCISE_TITLE);
    expect(exercise).toBeDefined();
    expect(exercise!.kind).toBe('ritual');
    expect(exercise!.category).toBe('Exercise');
    expect(exercise!.durationMinutes).toBe(60);
    expect(exercise!.start).toBe('15:00');
    expect(exercise!.date).toBe('2026-07-13');
  });

  it('places exercise at the free 60-min slot closest to 15:00 (earlier on a tie)', () => {
    // Block 15:00–16:00, so a 15:00 start is impossible. The two nearest free
    // 60-min slots are 14:00 and 16:00 (both 60 min away); the earlier wins.
    const blocks = run({
      scheduling: { workingHours: { start: '08:30', end: '19:00' } },
      busyIntervals: [busy(15, 0, 16, 0)],
    });
    const exercise = blocks.find(b => b.title === EXERCISE_TITLE);
    expect(exercise).toBeDefined();
    expect(exercise!.start).toBe('14:00');
  });

  it('skips exercise only when no free 60-min slot exists in the whole working day', () => {
    // The entire working day is busy → even the whole-day fallback finds nothing.
    const blocks = run({
      scheduling: { workingHours: { start: '13:00', end: '18:00' } },
      busyIntervals: [busy(13, 0, 18, 0)],
    });
    expect(blocks.find(b => b.title === EXERCISE_TITLE)).toBeUndefined();
  });

  it('dedupes exercise against an existing exercise event that day', () => {
    const blocks = run({
      scheduling: { workingHours: { start: '08:30', end: '19:00' } },
      existingRitualTitlesByDate: { '2026-07-13': new Set([EXERCISE_TITLE]) },
    });
    expect(blocks.find(b => b.title === EXERCISE_TITLE)).toBeUndefined();
    // Lunch + emails still proposed.
    expect(blocks.find(b => b.title === LUNCH_TITLE)).toBeDefined();
    expect(blocks.find(b => b.title === EMAILS_TITLE)).toBeDefined();
  });

  it('widens the exercise search to the whole working day when 13:00–18:00 is full', () => {
    // The core 13:00–18:00 window is entirely busy, so no 60-min slot fits there.
    // Exercise is priority one, so the search widens to the whole working day and
    // still places it — here 12:00 is the free hour closest to 15:00.
    const blocks = run({
      scheduling: { workingHours: { start: '09:00', end: '18:00' } },
      busyIntervals: [busy(13, 0, 18, 0)],
    });
    const exercise = blocks.find(b => b.title === EXERCISE_TITLE);
    expect(exercise).toBeDefined();
    expect(exercise!.start).toBe('12:00');
  });
});

describe('placeWeekRituals — prep/propose determinism', () => {
  const wide = makeConfig({ workingHours: { start: '08:30', end: '19:00' } });

  const placeWith = (busyIntervals: BusyInterval[]) =>
    placeWeekRituals({
      config: wide,
      weekEvents: [],
      busyIntervals,
      weekStart: WEEK_START,
      now: WEEK_START,
    });

  it('places the same ritual slots in the prep step and the propose step (prep never steals the exercise slot)', () => {
    // Prep step: rituals placed against the calendar busy only (no prep yet).
    const prepStep = placeWith([]);
    const exercise = prepStep.find(b => b.title === EXERCISE_TITLE);
    expect(exercise!.start).toBe('15:00');

    // Prep is then placed with the rituals reserved, so it lands elsewhere; that
    // accepted prep block never overlaps a ritual slot.
    const acceptedPrep: BusyInterval = {
      start: new Date(2026, 6, 13, 10, 0),
      end: new Date(2026, 6, 13, 11, 0),
    };

    // Propose step: rituals placed against calendar + accepted prep. Because the
    // prep avoids every ritual slot, the placements are byte-for-byte identical.
    const proposeStep = placeWith([acceptedPrep]);
    expect(proposeStep).toEqual(prepStep);
  });

  it('prep cannot take the 15:00 exercise slot once rituals are reserved first', () => {
    const rituals = placeWith([]);
    const exercise = rituals.find(b => b.title === EXERCISE_TITLE)!;
    expect(exercise.start).toBe('15:00');

    // Mirror the prep-candidates route: rituals join the busy set before prep.
    const prepBusy = rituals.map(proposedBlockToBusyInterval);
    const { placed } = proposePrepBlocks({
      meetings: [
        {
          eventId: 'm1',
          title: 'Sync',
          startMs: new Date(2026, 6, 13, 17, 0).getTime(),
          date: '2026-07-13',
          durationMinutes: 60,
        },
      ],
      config: wide,
      busyIntervals: prepBusy,
      weekStart: WEEK_START,
      now: WEEK_START,
    });
    expect(placed).toHaveLength(1);
    const prep = placed[0];
    const [ph, pm] = prep.start.split(':').map(Number);
    const prepStartMs = new Date(2026, 6, 13, ph, pm).getTime();
    const prepEndMs = prepStartMs + prep.durationMinutes * 60 * 1000;
    const exStartMs = new Date(2026, 6, 13, 15, 0).getTime();
    const exEndMs = new Date(2026, 6, 13, 16, 0).getTime();
    // Prep must not overlap the reserved 15:00–16:00 exercise slot.
    expect(prepStartMs < exEndMs && prepEndMs > exStartMs).toBe(false);
  });
});
