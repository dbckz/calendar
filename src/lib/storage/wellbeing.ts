// Wellbeing storage: the daily habit log and the experiments.
//
// Two domains in the user-data store (see ./db), read and written directly
// rather than through getUserData() — that rebuilds a whitelisted UserData
// object and would drop anything not on its list.
//
//   wellbeingDays        Record<yyyy-MM-dd, WellbeingDay>  — keyed by date so a
//                        re-run of the same day's review updates rather than
//                        appends a second record for it.
//   wellbeingExperiments Experiment[]
//
// Writes validate rather than trust the client. In particular a habit answered
// "no" MUST carry a reason: the reason is the only part of a skip worth having
// later, so saving one without it would quietly defeat the point of asking.

import { randomUUID } from 'crypto';

import { readAllDomains, writeAllDomains } from './db';
import { isValidHabitId } from '../wellbeing-habits';
import type {
  Experiment,
  ExperimentCheckIn,
  ExperimentStatus,
  ExperimentVerdict,
  HabitLog,
  WellbeingDay,
} from '@/types/wellbeing';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const STATUSES: ExperimentStatus[] = ['planned', 'running', 'complete', 'abandoned'];
const VERDICTS: ExperimentVerdict[] = ['worked', 'mixed', 'no-effect', 'inconclusive'];

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------

function readDays(): Record<string, WellbeingDay> {
  const raw = readAllDomains().wellbeingDays;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, WellbeingDay> = {};
  // Tolerant load: a malformed day is dropped rather than crashing the tab.
  for (const [date, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!DATE_RE.test(date)) continue;
    const day = value as WellbeingDay;
    if (!day || typeof day !== 'object' || !Array.isArray(day.habits)) continue;
    out[date] = {
      ...day,
      date,
      habits: day.habits.filter(
        (h): h is HabitLog => !!h && typeof h.habitId === 'string' && typeof h.done === 'boolean'
      ),
    };
  }
  return out;
}

// All logged days in [from, to] (both optional, both inclusive), oldest first.
export async function getWellbeingDays(from?: string, to?: string): Promise<WellbeingDay[]> {
  return Object.values(readDays())
    .filter(d => (!from || d.date >= from) && (!to || d.date <= to))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getWellbeingDay(date: string): Promise<WellbeingDay | null> {
  return readDays()[date] ?? null;
}

export interface SaveWellbeingDayInput {
  date: string;
  habits: HabitLog[];
  notes?: string;
}

// Upsert one day. Habits are MERGED by id, not replaced wholesale: the review
// may be re-run, or a later answer given for a habit left blank earlier, and
// neither should wipe an answer already recorded for that day. Passing an empty
// `habits` array therefore changes no answers — it only touches the notes.
export async function saveWellbeingDay(input: SaveWellbeingDayInput): Promise<WellbeingDay> {
  if (!DATE_RE.test(input.date ?? '')) {
    throw new Error('date must be yyyy-MM-dd');
  }

  const incoming: HabitLog[] = [];
  for (const habit of input.habits ?? []) {
    if (!habit || !isValidHabitId(habit.habitId)) {
      throw new Error(`Unknown habit: ${habit?.habitId}`);
    }
    if (typeof habit.done !== 'boolean') {
      throw new Error(`Habit ${habit.habitId} needs a yes or no answer`);
    }
    const reason = habit.reason?.trim();
    if (!habit.done && !reason) {
      throw new Error(`Say why ${habit.habitId} didn't happen`);
    }
    // A reason only means something against a skip; drop a stale one left over
    // from an answer that has since flipped to yes.
    incoming.push(habit.done ? { habitId: habit.habitId, done: true } : { habitId: habit.habitId, done: false, reason });
  }

  const days = readDays();
  const existing = days[input.date];
  const now = new Date().toISOString();

  const merged = new Map<string, HabitLog>();
  for (const habit of existing?.habits ?? []) merged.set(habit.habitId, habit);
  for (const habit of incoming) merged.set(habit.habitId, habit);

  // Omitting `notes` leaves whatever was already written for the day alone;
  // sending an empty string is how the note gets cleared.
  const notes = input.notes === undefined ? existing?.notes : input.notes.trim() || undefined;
  const day: WellbeingDay = {
    date: input.date,
    habits: [...merged.values()],
    ...(notes ? { notes } : {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  days[input.date] = day;
  writeAllDomains({ wellbeingDays: days });
  return day;
}

// ---------------------------------------------------------------------------
// Experiments
// ---------------------------------------------------------------------------

function readExperiments(): Experiment[] {
  const raw = readAllDomains().wellbeingExperiments;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (e): e is Experiment =>
        !!e &&
        typeof e === 'object' &&
        typeof (e as Experiment).id === 'string' &&
        typeof (e as Experiment).title === 'string'
    )
    .map(e => ({
      ...e,
      status: STATUSES.includes(e.status) ? e.status : 'planned',
      checkIns: Array.isArray(e.checkIns) ? e.checkIns : [],
    }));
}

export async function listExperiments(status?: ExperimentStatus): Promise<Experiment[]> {
  // Newest first — an experiment being set up or currently running is what the
  // tab is opened for; finished ones are history below it. Two created in the
  // same millisecond tie on createdAt, so insertion order breaks the tie (a
  // plain sort would leave the older one first, which reads as wrong).
  return readExperiments()
    .filter(e => !status || e.status === status)
    .map((experiment, index) => ({ experiment, index }))
    .sort((a, b) => b.experiment.createdAt.localeCompare(a.experiment.createdAt) || b.index - a.index)
    .map(({ experiment }) => experiment);
}

export type ExperimentInput = Partial<
  Pick<
    Experiment,
    | 'title'
    | 'hypothesis'
    | 'protocol'
    | 'measure'
    | 'startDate'
    | 'endDate'
    | 'status'
    | 'verdict'
    | 'reflection'
  >
>;

function validate(input: ExperimentInput): void {
  for (const key of ['startDate', 'endDate'] as const) {
    const value = input[key];
    if (value !== undefined && value !== '' && !DATE_RE.test(value)) {
      throw new Error(`${key} must be yyyy-MM-dd`);
    }
  }
  if (input.status !== undefined && !STATUSES.includes(input.status)) {
    throw new Error(`status must be one of: ${STATUSES.join(', ')}`);
  }
  if (input.verdict !== undefined && input.verdict !== null && !VERDICTS.includes(input.verdict)) {
    throw new Error(`verdict must be one of: ${VERDICTS.join(', ')}`);
  }
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    throw new Error('endDate cannot be before startDate');
  }
}

export async function createExperiment(input: ExperimentInput): Promise<Experiment> {
  const title = input.title?.trim();
  if (!title) throw new Error('An experiment needs a title');
  validate(input);

  const now = new Date().toISOString();
  const experiment: Experiment = {
    id: randomUUID(),
    title,
    hypothesis: input.hypothesis?.trim() || undefined,
    protocol: input.protocol?.trim() || undefined,
    measure: input.measure?.trim() || undefined,
    startDate: input.startDate || undefined,
    endDate: input.endDate || undefined,
    status: input.status ?? 'planned',
    checkIns: [],
    createdAt: now,
    updatedAt: now,
  };

  writeAllDomains({ wellbeingExperiments: [...readExperiments(), experiment] });
  return experiment;
}

export async function updateExperiment(
  id: string,
  patch: ExperimentInput
): Promise<Experiment | null> {
  validate(patch);
  const all = readExperiments();
  const index = all.findIndex(e => e.id === id);
  if (index === -1) return null;

  const current = all[index];
  const title = patch.title === undefined ? current.title : patch.title.trim();
  if (!title) throw new Error('An experiment needs a title');

  // Only the keys actually sent are touched, so a partial patch from one form
  // can't blank the fields another form owns. An empty string clears a field.
  const next: Experiment = { ...current, title, updatedAt: new Date().toISOString() };
  for (const key of ['hypothesis', 'protocol', 'measure', 'reflection'] as const) {
    if (patch[key] !== undefined) next[key] = patch[key]?.trim() || undefined;
  }
  for (const key of ['startDate', 'endDate'] as const) {
    if (patch[key] !== undefined) next[key] = patch[key] || undefined;
  }
  if (patch.status !== undefined) next.status = patch.status;
  if (patch.verdict !== undefined) next.verdict = patch.verdict || undefined;

  all[index] = next;
  writeAllDomains({ wellbeingExperiments: all });
  return next;
}

export async function deleteExperiment(id: string): Promise<boolean> {
  const all = readExperiments();
  const remaining = all.filter(e => e.id !== id);
  if (remaining.length === all.length) return false;
  writeAllDomains({ wellbeingExperiments: remaining });
  return true;
}

// Record one observation. A check-in on a 'planned' experiment starts it: the
// first note about how it is going is proof it is running, and making that
// implicit saves a step that would otherwise be forgotten.
export async function addExperimentCheckIn(
  id: string,
  input: { rating?: number; note?: string }
): Promise<Experiment | null> {
  const rating = input.rating;
  if (rating !== undefined && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    throw new Error('rating must be a whole number from 1 to 5');
  }
  const note = input.note?.trim();
  if (rating === undefined && !note) {
    throw new Error('A check-in needs a rating or a note');
  }

  const all = readExperiments();
  const index = all.findIndex(e => e.id === id);
  if (index === -1) return null;

  const checkIn: ExperimentCheckIn = {
    at: new Date().toISOString(),
    ...(rating !== undefined ? { rating } : {}),
    ...(note ? { note } : {}),
  };
  const current = all[index];
  all[index] = {
    ...current,
    status: current.status === 'planned' ? 'running' : current.status,
    checkIns: [...current.checkIns, checkIn],
    updatedAt: checkIn.at,
  };
  writeAllDomains({ wellbeingExperiments: all });
  return all[index];
}
