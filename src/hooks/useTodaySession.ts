'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';

import { api } from '@/lib/api';
import { exerciseKey, type ProgressionPoint } from '@/lib/exercise-progression';
import { describeVolumeLoad, type ExerciseTarget, type TargetAction } from '@/lib/exercise-targets';
import type { ExerciseEntry, ExerciseSession } from '@/types/life';

// Today's workout as one interactive checklist, shared by the desktop Today tab
// and the mobile Exercise tab. Each row carries BOTH the guidance (what to aim
// for and why, from the last workout) and the live state (ticked, actual
// sets/reps/kg, note) — the two used to live on separate screens.
//
// The session is created lazily: opening the tab must not write anything (that
// would leave completed-but-untouched sessions polluting the stats). The first
// write action calls the idempotent /start route, and a single shared promise
// guards it so two quick ticks can't create two sessions.

export interface TodayRow {
  // Stable across reconciles: a target's progression key, or `entry:<id>` for an
  // exercise added on the spot with no guidance.
  key: string;
  name: string;
  // Present once the row is backed by a real session entry.
  entryId?: string;
  done: boolean;
  sets?: number;
  reps?: number;
  holdSeconds?: number;
  weightKg?: number;
  notes?: string;
  // What to aim for, e.g. "3 × 8 · 40kg".
  targetText?: string;
  // Guidance from the previous workout. Absent on added-on-the-spot exercises.
  action?: TargetAction;
  rationale?: string;
  last?: ProgressionPoint;
}

export interface TodayPlan {
  label?: string;
  components: string[];
}

export type FieldPatch = Partial<Pick<TodayRow, 'sets' | 'reps' | 'holdSeconds' | 'weightKg'>>;

function today(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

// Shorthand the entries route can parse, for seeding an entry from a row.
function volumeShorthand(t: { sets?: number; reps?: number; holdSeconds?: number }): string {
  if (t.sets && t.reps) return `${t.sets}*${t.reps}`;
  if (t.sets && t.holdSeconds) return `${t.sets}*${t.holdSeconds}s`;
  return '';
}

function rowFromTarget(t: ExerciseTarget): TodayRow {
  return {
    key: t.key,
    name: t.name,
    done: false,
    sets: t.sets,
    reps: t.reps,
    holdSeconds: t.holdSeconds,
    weightKg: t.weightKg,
    targetText: describeVolumeLoad(t) || undefined,
    action: t.action,
    rationale: t.rationale,
    last: t.last,
  };
}

function rowFromEntry(e: ExerciseEntry): TodayRow {
  return {
    key: `entry:${e.id}`,
    name: e.name,
    entryId: e.id,
    done: !!e.done,
    sets: e.sets,
    reps: e.reps,
    holdSeconds: e.holdSeconds,
    weightKg: e.weightKg,
    notes: e.notes,
    targetText: e.targetText,
  };
}

// Server entry state laid over a row, keeping the row's guidance fields.
function applyEntry(row: TodayRow, e: ExerciseEntry): TodayRow {
  return {
    ...row,
    entryId: e.id,
    done: !!e.done,
    sets: e.sets ?? row.sets,
    reps: e.reps ?? row.reps,
    holdSeconds: e.holdSeconds ?? row.holdSeconds,
    weightKg: e.weightKg ?? row.weightKg,
    notes: e.notes ?? row.notes,
    targetText: e.targetText ?? row.targetText,
  };
}

// Guidance rows first (in target order), then any entries added on the spot.
function mergeRows(targets: ExerciseTarget[], session: ExerciseSession | null): TodayRow[] {
  const entries = session?.exercises ?? [];
  const used = new Set<string>();
  const rows = targets.map(t => {
    const match = entries.find(e => !used.has(e.id) && exerciseKey(e.name) === t.key);
    if (match) {
      used.add(match.id);
      return applyEntry(rowFromTarget(t), match);
    }
    return rowFromTarget(t);
  });
  for (const e of entries) {
    if (!used.has(e.id)) rows.push(rowFromEntry(e));
  }
  return rows;
}

export function useTodaySession(dateArg?: string, onSessionChanged?: () => void) {
  const date = dateArg ?? today();

  const [rows, setRows] = useState<TodayRow[]>([]);
  const [plan, setPlan] = useState<TodayPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const targetsRef = useRef<ExerciseTarget[]>([]);
  const sessionRef = useRef<ExerciseSession | null>(null);
  const ensureRef = useRef<Promise<ExerciseSession> | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [targetsRes, sessionsRes] = await Promise.all([
        api.getExerciseTargets(date),
        api.getExerciseSessions(date, date),
      ]);
      // The one the /start route would resume: today's logged manual session.
      const session =
        sessionsRes.sessions.find(s => s.completed && s.source === 'manual') ?? null;
      targetsRef.current = targetsRes.targets;
      sessionRef.current = session;
      setPlan(targetsRes.plan ?? null);
      setRows(mergeRows(targetsRes.targets, session));
    } catch (err) {
      console.error('Failed to load today’s workout:', err);
      setError('Could not load today’s workout.');
    } finally {
      setIsLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  // Create-or-resume today's session, once. Concurrent first-actions share the
  // one in-flight promise, so two quick ticks never fork two sessions.
  const ensureSession = useCallback(async (): Promise<ExerciseSession> => {
    if (sessionRef.current) return sessionRef.current;
    if (!ensureRef.current) {
      ensureRef.current = api
        .startExerciseSession(date)
        .then(res => {
          sessionRef.current = res.session;
          return res.session;
        })
        .finally(() => {
          ensureRef.current = null;
        });
    }
    return ensureRef.current;
  }, [date]);

  // Find the session entry for a row, creating it if it has gone (e.g. removed
  // on another device since this session was started).
  const resolveEntryId = useCallback(async (session: ExerciseSession, row: TodayRow): Promise<string> => {
    const entries = session.exercises ?? [];
    const existing =
      entries.find(e => e.id === row.entryId) ??
      (row.key.startsWith('entry:')
        ? entries.find(e => `entry:${e.id}` === row.key)
        : entries.find(e => exerciseKey(e.name) === row.key));
    if (existing) return existing.id;

    const res = await api.addExerciseEntry(session.id, {
      name: row.name,
      volumeText: volumeShorthand(row),
      loadText: row.weightKg !== undefined ? `${row.weightKg}kg` : '',
    });
    sessionRef.current = res.session;
    return res.entry.id;
  }, []);

  // The shared optimistic-write path: apply locally, ensure the session, patch
  // the entry, reconcile that row from the server (guidance preserved), roll
  // back on failure.
  const runWrite = useCallback(
    async (
      row: TodayRow,
      optimistic: (r: TodayRow) => TodayRow,
      patch: (session: ExerciseSession, entryId: string) => Promise<ExerciseSession>
    ) => {
      setBusyKey(row.key);
      setError(null);
      setRows(rs => rs.map(r => (r.key === row.key ? optimistic(r) : r)));
      try {
        const base = await ensureSession();
        const entryId = await resolveEntryId(base, row);
        const updated = await patch(sessionRef.current ?? base, entryId);
        sessionRef.current = updated;
        const entry = (updated.exercises ?? []).find(e => e.id === entryId);
        setRows(rs =>
          rs.map(r => (r.key === row.key ? (entry ? applyEntry(row, entry) : optimistic(row)) : r))
        );
        onSessionChanged?.();
      } catch (err) {
        console.error('Exercise write failed:', err);
        setError('Could not save that — check your connection.');
        // Roll back to the row as it was when the write started.
        setRows(rs => rs.map(r => (r.key === row.key ? row : r)));
      } finally {
        setBusyKey(null);
      }
    },
    [ensureSession, resolveEntryId, onSessionChanged]
  );

  const toggleDone = useCallback(
    (row: TodayRow) =>
      runWrite(
        row,
        r => ({ ...r, done: !r.done }),
        (s, id) => api.updateExerciseEntry(s.id, id, { done: !row.done }).then(res => res.session)
      ),
    [runWrite]
  );

  const commitField = useCallback(
    (row: TodayRow, patch: FieldPatch) =>
      runWrite(
        row,
        r => ({ ...r, ...patch }),
        (s, id) => api.updateExerciseEntry(s.id, id, patch).then(res => res.session)
      ),
    [runWrite]
  );

  const commitNote = useCallback(
    (row: TodayRow, notes: string) =>
      runWrite(
        row,
        r => ({ ...r, notes }),
        (s, id) => api.updateExerciseEntry(s.id, id, { notes }).then(res => res.session)
      ),
    [runWrite]
  );

  const addExercise = useCallback(
    async (input: { name: string; volume?: string; load?: string }) => {
      setError(null);
      const base = await ensureSession();
      const res = await api.addExerciseEntry(base.id, {
        name: input.name,
        volumeText: input.volume ?? '',
        loadText: input.load ?? '',
      });
      sessionRef.current = res.session;
      // If it matches an un-logged guidance row, fill that row rather than
      // showing the exercise twice.
      const key = exerciseKey(res.entry.name);
      setRows(rs => {
        const idx = rs.findIndex(r => !r.entryId && !r.key.startsWith('entry:') && r.key === key);
        if (idx >= 0) return rs.map((r, i) => (i === idx ? applyEntry(r, res.entry) : r));
        return [...rs, rowFromEntry(res.entry)];
      });
      onSessionChanged?.();
    },
    [ensureSession, onSessionChanged]
  );

  const removeRow = useCallback(
    async (row: TodayRow) => {
      const previous = rows;
      setBusyKey(row.key);
      setError(null);
      setRows(rs => rs.filter(r => r.key !== row.key));
      try {
        // A guidance row never logged has nothing to remove server-side — and
        // removing it must not create a session just to delete one entry.
        if (row.entryId || sessionRef.current) {
          const base = await ensureSession();
          const entryId = await resolveEntryId(base, row);
          const res = await api.removeExerciseEntry(base.id, entryId);
          sessionRef.current = res.session;
          onSessionChanged?.();
        }
      } catch (err) {
        console.error('Failed to remove exercise:', err);
        setError('Could not remove that exercise.');
        setRows(previous);
      } finally {
        setBusyKey(null);
      }
    },
    [rows, ensureSession, resolveEntryId, onSessionChanged]
  );

  const doneCount = rows.filter(r => r.done).length;

  return {
    date,
    plan,
    rows,
    doneCount,
    totalCount: rows.length,
    isLoading,
    error,
    busyKey,
    reload: load,
    toggleDone,
    commitField,
    commitNote,
    addExercise,
    removeRow,
  };
}
