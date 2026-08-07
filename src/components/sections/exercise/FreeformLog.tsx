'use client';

import { useState } from 'react';
import { Loader2, Trash2, Wand2 } from 'lucide-react';

import { api } from '@/lib/api';
import type { FreeformDraft } from '@/lib/exercise-freeform';
import type { ExerciseIntensity } from '@/types/life';
import { describeEntry } from './ExerciseEntryList';

// Logging a session that went off-plan: write what you did in your own words,
// let Claude read it into the log, check it, save it.
//
// Two steps rather than one, on the desktop: the parse is a guess at prose, and
// a wrong weight in the history quietly corrupts every future target derived
// from it. Checking it costs one glance. (Mobile saves in one tap — see the
// route — because there the friction is the whole problem.)
const INTENSITIES: ExerciseIntensity[] = ['easy', 'moderate', 'hard'];

const PLACEHOLDER = `Meeting overran so no gym. Did 35 mins on the exercise bike at home, then 3 sets of 12 press-ups and a 2 min plank. Legs still heavy from Saturday's run.`;

export function FreeformLog({
  date,
  onSaved,
  onCancel,
}: {
  date: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<FreeformDraft | null>(null);
  // False when the model could not be reached: the text is still logged, just
  // not broken into exercises.
  const [parsed, setParsed] = useState(true);
  const [busy, setBusy] = useState<'reading' | 'saving' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const read = async () => {
    if (!text.trim()) return;
    setBusy('reading');
    setError(null);
    try {
      const result = await api.logExerciseFreeform({ text, date });
      if (!result.draft) throw new Error('Nothing came back from the parse.');
      setDraft(result.draft);
      setParsed(result.parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that.');
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!draft) return;
    setBusy('saving');
    setError(null);
    try {
      await api.logExerciseFreeform({ text, date: draft.date, draft });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
    } finally {
      setBusy(null);
    }
  };

  const patch = (changes: Partial<FreeformDraft>) =>
    setDraft(current => (current ? { ...current, ...changes } : current));

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold text-gray-600">
          What did you actually do{draft ? '?' : ' today?'}
        </span>
        <span className="text-[11px] text-gray-400">
          Write it however you like — it gets read into the log.
        </span>
      </div>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={5}
        autoFocus
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm leading-6"
      />

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {draft && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          {!parsed && (
            <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Couldn’t break it into exercises — your text is kept as the
              session’s notes, so nothing is lost. Fill in what you want below.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input
                type="date"
                value={draft.date}
                onChange={e => patch({ date: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Type">
              <input
                value={draft.type}
                onChange={e => patch({ type: e.target.value })}
                placeholder="run, gym, football"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Minutes">
              <input
                type="number"
                min="1"
                value={draft.durationMinutes ?? ''}
                onChange={e =>
                  patch({ durationMinutes: e.target.value ? Number(e.target.value) : undefined })
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Distance (km)">
              <input
                type="number"
                min="0"
                step="0.1"
                value={draft.distanceKm ?? ''}
                onChange={e =>
                  patch({ distanceKm: e.target.value ? Number(e.target.value) : undefined })
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Intensity">
              <select
                value={draft.intensity ?? ''}
                onChange={e =>
                  patch({ intensity: (e.target.value || undefined) as ExerciseIntensity | undefined })
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Not recorded</option>
                {INTENSITIES.map(i => (
                  <option key={i} value={i} className="capitalize">
                    {i}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notes">
              <input
                value={draft.notes ?? ''}
                onChange={e => patch({ notes: e.target.value || undefined })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </Field>
          </div>

          <div className="mt-3">
            <span className="mb-1 block text-xs font-semibold text-gray-600">
              Exercises read from your text
            </span>
            {draft.exercises.length === 0 ? (
              <p className="text-sm text-gray-500">
                None — this is logged as a whole session, which is right for a run or a match.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
                {draft.exercises.map((entry, index) => (
                  <li
                    key={`${entry.name}-${index}`}
                    className="flex items-baseline justify-between gap-3 px-3 py-2"
                  >
                    <span className="min-w-0 text-sm text-gray-900">{entry.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs tabular-nums text-gray-500">
                        {describeEntry({ ...entry, id: String(index) })}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          patch({ exercises: draft.exercises.filter((_, i) => i !== index) })
                        }
                        aria-label={`Remove ${entry.name}`}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-[11px] text-gray-400">
              Your original text is saved with the session either way, so a misreading can always be
              corrected from it.
            </p>
          </div>
        </div>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Cancel
        </button>
        {draft ? (
          <>
            <button
              type="button"
              onClick={read}
              disabled={busy !== null}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Read again
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy !== null || !draft.type.trim()}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {busy === 'saving' ? 'Saving…' : 'Save session'}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={read}
            disabled={busy !== null || !text.trim()}
            className="flex items-center gap-1.5 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {busy === 'reading' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            {busy === 'reading' ? 'Reading…' : 'Read it'}
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gray-600">{label}</span>
      {children}
    </label>
  );
}
