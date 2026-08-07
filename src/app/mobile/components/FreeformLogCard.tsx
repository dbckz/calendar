'use client';

import { useState } from 'react';
import { Loader2, Wand2, X } from 'lucide-react';

import { api } from '@/lib/api';

// "Did something else" on the phone: type what you actually did and save it in
// one tap. No preview step, unlike the desktop — this is written standing
// somewhere with one hand, and a confirmation table would be the friction that
// stops the session getting logged at all. The original text is stored on the
// session, so anything read wrongly can be corrected later at a desk.
export function FreeformLogCard({ onLogged }: { onLogged?: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const save = async () => {
    if (!text.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api.logExerciseFreeform({ text, save: true });
      setSaved(
        result.parsed
          ? 'Logged.'
          : 'Logged as written — it couldn’t be broken into exercises, but nothing is lost.'
      );
      setText('');
      setOpen(false);
      onLogged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log that.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setSaved(null);
          }}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm font-medium text-gray-600"
        >
          <Wand2 className="h-4 w-4" />
          Did something else? Log it
        </button>
        {saved && <p className="mt-1.5 text-xs text-emerald-700">{saved}</p>}
      </div>
    );
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-600">What did you do?</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Cancel"
          className="p-1 text-gray-400"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Five-a-side for an hour instead of the gym. Knee held up fine."
        rows={4}
        autoFocus
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-base leading-6"
      />

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={save}
        disabled={saving || !text.trim()}
        className="mt-2 flex h-12 w-full items-center justify-center gap-1.5 rounded-md bg-gray-900 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {saving ? 'Logging…' : 'Log it'}
      </button>
      <p className="mt-1.5 text-[11px] text-gray-400">
        Read into the log automatically. Your words are kept with the session either way.
      </p>
    </section>
  );
}
