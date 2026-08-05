'use client';

import { useCallback, useMemo, useState } from 'react';
import { Check, Loader2, Plus, Trash2, X } from 'lucide-react';

import { api } from '@/lib/api';
import type { ExerciseEntry, ExerciseSession } from '@/types/life';

// The in-the-gym view: today's session, one exercise per row, with the weight
// and reps to aim for already filled in.
//
// Design constraints come from where it is used — standing in a gym, one-handed,
// on a phone that may lose signal:
//   * every action saves on its own, immediately (no "save session" button to
//     forget, nothing lost if the app is closed mid-workout)
//   * updates are optimistic, so a tick responds instantly and reconciles after
//   * tap targets are large; the common case (did it as prescribed) is one tap
export function GymSession({
  session,
  onChange,
}: {
  session: ExerciseSession;
  onChange: (session: ExerciseSession) => void;
}) {
  // Memoised because the optimistic patch callback depends on it; a fresh []
  // each render would rebuild that callback on every tick.
  const entries = useMemo(() => session.exercises ?? [], [session.exercises]);
  const doneCount = entries.filter(e => e.done).length;

  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const patchEntry = useCallback(
    async (entryId: string, patch: Partial<ExerciseEntry>) => {
      setBusyId(entryId);
      setError(null);
      // Optimistic: the tick has to feel instant between sets.
      onChange({
        ...session,
        exercises: entries.map(e => (e.id === entryId ? { ...e, ...patch } : e)),
      });
      try {
        const res = await api.updateExerciseEntry(session.id, entryId, patch);
        onChange(res.session);
      } catch (err) {
        console.error('Failed to update exercise entry:', err);
        setError('Could not save that — check your connection.');
        onChange(session); // roll back to what the server last confirmed
      } finally {
        setBusyId(null);
      }
    },
    [session, entries, onChange]
  );

  const removeEntry = useCallback(
    async (entryId: string) => {
      setBusyId(entryId);
      try {
        const res = await api.removeExerciseEntry(session.id, entryId);
        onChange(res.session);
      } catch (err) {
        console.error('Failed to remove exercise entry:', err);
        setError('Could not remove that exercise.');
      } finally {
        setBusyId(null);
      }
    },
    [session.id, onChange]
  );

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          {session.label || 'Today'}
        </h2>
        <span className="text-sm tabular-nums text-gray-500">
          {doneCount}/{entries.length} done
        </span>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {entries.map(entry => (
          <EntryRow
            key={entry.id}
            entry={entry}
            busy={busyId === entry.id}
            open={openId === entry.id}
            onToggleOpen={() => setOpenId(openId === entry.id ? null : entry.id)}
            onPatch={patch => patchEntry(entry.id, patch)}
            onRemove={() => removeEntry(entry.id)}
          />
        ))}
      </div>

      {adding ? (
        <AddEntryForm
          sessionId={session.id}
          onAdded={onChange}
          onClose={() => setAdding(false)}
          onError={setError}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex h-12 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 text-sm font-medium text-gray-600 active:bg-gray-50"
        >
          <Plus className="h-4 w-4" />
          Add an exercise
        </button>
      )}
    </section>
  );
}

function EntryRow({
  entry,
  busy,
  open,
  onToggleOpen,
  onPatch,
  onRemove,
}: {
  entry: ExerciseEntry;
  busy: boolean;
  open: boolean;
  onToggleOpen: () => void;
  onPatch: (patch: Partial<ExerciseEntry>) => void;
  onRemove: () => void;
}) {
  const [note, setNote] = useState(entry.notes ?? '');

  return (
    <div
      className={`rounded-lg border bg-white shadow-sm transition-colors ${
        entry.done ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200'
      }`}
    >
      <div className="flex items-stretch">
        {/* The common case is one tap: it went as prescribed. */}
        <button
          type="button"
          onClick={() => onPatch({ done: !entry.done })}
          disabled={busy}
          aria-pressed={!!entry.done}
          aria-label={entry.done ? `Mark ${entry.name} not done` : `Mark ${entry.name} done`}
          className="flex w-14 flex-shrink-0 items-center justify-center"
        >
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors ${
              entry.done
                ? 'border-emerald-600 bg-emerald-600 text-white'
                : 'border-gray-300 text-transparent'
            }`}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            ) : (
              <Check className="h-4 w-4" />
            )}
          </span>
        </button>

        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          className="min-w-0 flex-1 py-3 pr-3 text-left"
        >
          <p
            className={`text-sm font-medium ${
              entry.done ? 'text-gray-500 line-through' : 'text-gray-900'
            }`}
          >
            {entry.name}
          </p>
          <p className="mt-0.5 text-xs tabular-nums text-gray-600">
            {describeEntry(entry)}
            {entry.targetText && entry.targetText !== describeEntry(entry) && (
              <span className="text-gray-400"> · target {entry.targetText}</span>
            )}
          </p>
          {entry.notes && !open && <p className="mt-0.5 text-xs text-gray-500">{entry.notes}</p>}
        </button>
      </div>

      {open && (
        <div className="border-t border-gray-100 p-3">
          <div className="flex flex-wrap gap-2">
            <NumberField
              label="Sets"
              value={entry.sets}
              onCommit={v => onPatch({ sets: v })}
            />
            {entry.holdSeconds !== undefined ? (
              <NumberField
                label="Secs"
                value={entry.holdSeconds}
                onCommit={v => onPatch({ holdSeconds: v })}
              />
            ) : (
              <NumberField label="Reps" value={entry.reps} onCommit={v => onPatch({ reps: v })} />
            )}
            <NumberField
              label="kg"
              value={entry.weightKg}
              step={0.5}
              onCommit={v => onPatch({ weightKg: v })}
            />
          </div>

          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-semibold text-gray-600">
              How did it feel?
            </span>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              onBlur={() => note !== (entry.notes ?? '') && onPatch({ notes: note })}
              placeholder="Could have done 2 more…"
              className="h-11 w-full rounded-md border border-gray-300 px-3 text-sm"
            />
          </label>
          <p className="mt-1 text-[11px] text-gray-400">
            This note sets next session&apos;s target, so &ldquo;could have done 2 more&rdquo; is
            worth writing.
          </p>

          <button
            type="button"
            onClick={onRemove}
            className="mt-3 flex items-center gap-1.5 text-xs font-medium text-gray-400 active:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove from this session
          </button>
        </div>
      )}
    </div>
  );
}

// Commits on blur rather than on every keystroke, so a half-typed "3" in a
// weight field never gets saved as the weight.
function NumberField({
  label,
  value,
  step = 1,
  onCommit,
}: {
  label: string;
  value?: number;
  step?: number;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value));

  return (
    <label className="flex-1 min-w-20">
      <span className="mb-1 block text-xs font-semibold text-gray-600">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={() => {
          const parsed = Number(text);
          if (text.trim() !== '' && Number.isFinite(parsed) && parsed !== value) onCommit(parsed);
        }}
        className="h-11 w-full rounded-md border border-gray-300 px-2 text-center text-sm tabular-nums"
      />
    </label>
  );
}

function AddEntryForm({
  sessionId,
  onAdded,
  onClose,
  onError,
}: {
  sessionId: string;
  onAdded: (session: ExerciseSession) => void;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const [volume, setVolume] = useState('');
  const [load, setLoad] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await api.addExerciseEntry(sessionId, {
        name: name.trim(),
        volumeText: volume.trim(),
        loadText: load.trim(),
      });
      onAdded(res.session);
      onClose();
    } catch (err) {
      console.error('Failed to add exercise:', err);
      onError('Could not add that exercise.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-600">New exercise</span>
        <button type="button" onClick={onClose} aria-label="Cancel" className="p-1 text-gray-400">
          <X className="h-4 w-4" />
        </button>
      </div>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Exercise"
        className="h-11 w-full rounded-md border border-gray-300 px-3 text-sm"
        autoFocus
      />
      <div className="mt-2 flex gap-2">
        <input
          value={volume}
          onChange={e => setVolume(e.target.value)}
          placeholder="3*8"
          className="h-11 flex-1 rounded-md border border-gray-300 px-3 text-sm"
        />
        <input
          value={load}
          onChange={e => setLoad(e.target.value)}
          placeholder="27kg"
          className="h-11 flex-1 rounded-md border border-gray-300 px-3 text-sm"
        />
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving || !name.trim()}
        className="mt-2 h-11 w-full rounded-md bg-gray-900 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? 'Adding…' : 'Add'}
      </button>
    </div>
  );
}

// Shared with the desktop list, but inlined here to keep the phone bundle from
// pulling in the whole desktop section.
function describeEntry(entry: ExerciseEntry): string {
  const parts: string[] = [];
  if (entry.sets && entry.reps) parts.push(`${entry.sets} × ${entry.reps}`);
  else if (entry.sets && entry.holdSeconds) parts.push(`${entry.sets} × ${entry.holdSeconds}s`);
  if (entry.perSide && parts.length > 0) parts[parts.length - 1] += ' each side';
  if (entry.weightKg !== undefined) parts.push(`${entry.weightKg}kg`);
  else if (entry.bodyweight) parts.push('bodyweight');
  return parts.join(' · ') || [entry.volumeText, entry.loadText].filter(Boolean).join(' · ');
}
