'use client';

import { useEffect, useState } from 'react';
import { HeartPulse } from 'lucide-react';

import { api } from '@/lib/api';
import { HABITS } from '@/lib/wellbeing-habits';
import type { HabitLog } from '@/types/wellbeing';

// The state of one habit's question. 'unanswered' is deliberately distinct from
// "no": a day left blank is a day nothing is known about, and the analysis
// treats it that way rather than counting it as a miss.
export type HabitAnswer = { done?: boolean; reason: string };
export type HabitAnswers = Record<string, HabitAnswer>;

export function emptyHabitAnswers(): HabitAnswers {
  return Object.fromEntries(HABITS.map(h => [h.id, { reason: '' }]));
}

// A "no" is only saveable with a reason. Returns the habit ids that are
// incomplete, so the modal can block the save and point at what's missing.
export function incompleteHabits(answers: HabitAnswers): string[] {
  return HABITS.filter(h => answers[h.id]?.done === false && !answers[h.id]?.reason.trim()).map(
    h => h.id
  );
}

// The answers as storage wants them: only the habits actually answered.
export function habitLogsFrom(answers: HabitAnswers): HabitLog[] {
  return HABITS.flatMap(h => {
    const answer = answers[h.id];
    if (answer?.done === undefined) return [];
    return [
      answer.done
        ? { habitId: h.id, done: true }
        : { habitId: h.id, done: false, reason: answer.reason.trim() },
    ];
  });
}

interface HabitCheckPanelProps {
  date: string; // yyyy-MM-dd — the logical day being reviewed
  answers: HabitAnswers;
  onChange: (answers: HabitAnswers) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  // Set once the user has tried to save, so the missing-reason warning appears
  // on the attempt rather than while they're still typing.
  showErrors?: boolean;
}

// The daily habits, asked at the end of the daily review. Any answer already
// recorded for the day is loaded in, so re-running the review shows what was
// said rather than a blank form.
export function HabitCheckPanel({
  date,
  answers,
  onChange,
  notes,
  onNotesChange,
  showErrors = false,
}: HabitCheckPanelProps) {
  const [loadedDate, setLoadedDate] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getWellbeingDays(date, date)
      .then(res => {
        if (cancelled) return;
        const day = res.days[0];
        if (day) {
          const seeded = emptyHabitAnswers();
          for (const log of day.habits) {
            if (seeded[log.habitId]) {
              seeded[log.habitId] = { done: log.done, reason: log.reason ?? '' };
            }
          }
          onChange(seeded);
          if (day.notes) onNotesChange(day.notes);
        }
        setLoadedDate(date);
      })
      .catch(() => setLoadedDate(date));
    return () => {
      cancelled = true;
    };
    // Seeding runs once per day being reviewed; onChange/onNotesChange are the
    // modal's setters and re-running on their identity would clobber typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const missing = showErrors ? incompleteHabits(answers) : [];

  const setAnswer = (habitId: string, patch: Partial<HabitAnswer>) =>
    onChange({ ...answers, [habitId]: { ...answers[habitId], ...patch } });

  return (
    <section className="mt-4 rounded-lg border border-violet-200 bg-violet-50/50 p-3.5">
      <div className="flex items-center gap-2">
        <HeartPulse className="h-4 w-4 text-violet-500" />
        <h3 className="text-sm font-medium text-gray-800">Daily habits</h3>
        {loadedDate === null && <span className="text-[11px] text-gray-400">loading…</span>}
      </div>

      <ul className="mt-2.5 space-y-2.5">
        {HABITS.map(habit => {
          const answer = answers[habit.id] ?? { reason: '' };
          const needsReason = missing.includes(habit.id);
          return (
            <li key={habit.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-gray-700">{habit.question}</span>
                <div
                  role="group"
                  aria-label={habit.question}
                  className="inline-flex flex-shrink-0 overflow-hidden rounded-md border border-gray-200 text-[11px] font-medium"
                >
                  <button
                    type="button"
                    onClick={() => setAnswer(habit.id, { done: answer.done === true ? undefined : true })}
                    aria-pressed={answer.done === true}
                    className={`px-2.5 py-1 transition-colors ${
                      answer.done === true
                        ? 'bg-emerald-500 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnswer(habit.id, { done: answer.done === false ? undefined : false })}
                    aria-pressed={answer.done === false}
                    className={`px-2.5 py-1 transition-colors ${
                      answer.done === false
                        ? 'bg-gray-500 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>

              {answer.done === false && (
                <div className="mt-1.5">
                  <input
                    type="text"
                    value={answer.reason}
                    onChange={e => setAnswer(habit.id, { reason: e.target.value })}
                    placeholder="Why not? (required)"
                    aria-label={`Why ${habit.label.toLowerCase()} didn’t happen`}
                    aria-invalid={needsReason}
                    className={`w-full rounded-md border px-2 py-1 text-xs focus:outline-none focus:ring-1 ${
                      needsReason
                        ? 'border-red-300 focus:ring-red-400'
                        : 'border-gray-200 focus:ring-orange-400'
                    }`}
                  />
                  {needsReason && (
                    <p className="mt-1 text-[11px] text-red-600">
                      Say what got in the way — that’s the part worth having later.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3">
        <label className="block text-[11px] font-medium text-gray-600" htmlFor="wellbeing-notes">
          Anything else worth noting?
        </label>
        <textarea
          id="wellbeing-notes"
          value={notes}
          onChange={e => onNotesChange(e.target.value)}
          rows={2}
          placeholder="Optional — mood, sleep, what the day was like. Useful context later."
          className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
        />
      </div>
    </section>
  );
}
