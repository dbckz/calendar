// Per-exercise progression: how a given lift has moved over time.
//
// This is the reason the log is kept at exercise level rather than session
// level. "Am I training enough?" is a session-count question; "is my chest press
// going up?" can only be answered from the individual sets.

import type { ExerciseSession } from '@/types/life';

export interface ProgressionPoint {
  date: string; // yyyy-MM-dd
  weightKg?: number;
  sets?: number;
  reps?: number;
  holdSeconds?: number;
  // sets × reps × weight for the session — the usual rough proxy for work done.
  volume?: number;
  notes?: string;
}

export interface ExerciseProgression {
  // The display name, taken from the most recent spelling.
  name: string;
  key: string;
  sessions: number;
  points: ProgressionPoint[];
  first?: ProgressionPoint;
  latest?: ProgressionPoint;
  // Change in top weight from first to latest, in kg. Undefined when the
  // exercise has never been loaded (bodyweight work), where it would be noise.
  weightChangeKg?: number;
}

// Equivalent names, keyed by normalised form → canonical key.
//
// There is deliberately NO general "strip the equipment word" rule. Equipment
// usually IS the distinction: per Dave, dumbbell and cable versions of a
// movement are always different exercises (the weights aren't comparable — 7kg
// of dumbbell lateral raise against 2.5kg on the cable), and a bar lat pulldown
// is a different exercise from a cable one. So equivalences are only ever
// asserted case by case, from a confirmed answer, not inferred.
const ALIASES: Record<string, string> = {
  // A Paloff press is always done with a cable, so the qualifier is noise.
  'paloff press with cable': 'paloff press',
  // "Treadmill" is shorthand for a treadmill run. Kept SEPARATE from "Run",
  // which means outdoors and is a meaningfully harder effort.
  treadmill: 'treadmill run',
  // Same movement, two names for the machine.
  'rear delt machine': 'reverse pec deck machine',
};

// Exercise names are typed by hand and drift ("Db lateral raise" vs "DB lateral
// raise"). Matching on a normalised key keeps one lift's history together
// without forcing a fixed exercise list.
export function exerciseKey(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return ALIASES[base] ?? base;
}

export function buildProgressions(sessions: ExerciseSession[]): ExerciseProgression[] {
  const byKey = new Map<string, ExerciseProgression>();

  // Oldest first, so `first` and `latest` mean what they say.
  const ordered = [...sessions]
    .filter(s => s.completed && s.exercises?.length)
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const session of ordered) {
    for (const entry of session.exercises ?? []) {
      const key = exerciseKey(entry.name);
      if (!key) continue;

      const point: ProgressionPoint = {
        date: session.date,
        ...(entry.weightKg !== undefined ? { weightKg: entry.weightKg } : {}),
        ...(entry.sets !== undefined ? { sets: entry.sets } : {}),
        ...(entry.reps !== undefined ? { reps: entry.reps } : {}),
        ...(entry.holdSeconds !== undefined ? { holdSeconds: entry.holdSeconds } : {}),
        ...(entry.notes ? { notes: entry.notes } : {}),
      };
      if (entry.weightKg !== undefined && entry.sets && entry.reps) {
        point.volume = entry.weightKg * entry.sets * entry.reps;
      }

      const existing = byKey.get(key);
      if (existing) {
        existing.points.push(point);
        existing.sessions += 1;
        // The latest spelling wins, so a tidied-up name shows through.
        existing.name = entry.name;
      } else {
        byKey.set(key, { name: entry.name, key, sessions: 1, points: [point] });
      }
    }
  }

  return [...byKey.values()]
    .map(p => {
      const loaded = p.points.filter(pt => pt.weightKg !== undefined);
      const first = p.points[0];
      const latest = p.points[p.points.length - 1];
      return {
        ...p,
        ...(first ? { first } : {}),
        ...(latest ? { latest } : {}),
        // Only meaningful across two or more loaded sessions.
        ...(loaded.length >= 2
          ? {
              weightChangeKg:
                round1((loaded[loaded.length - 1].weightKg ?? 0) - (loaded[0].weightKg ?? 0)),
            }
          : {}),
      };
    })
    // Most-trained first: the lifts with the most history are the ones worth
    // looking at.
    .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
