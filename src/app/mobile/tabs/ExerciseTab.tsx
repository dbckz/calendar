'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Dumbbell, Play } from 'lucide-react';

import { api } from '@/lib/api';
import { GymSession } from '../components/GymSession';

import { describeEntry } from '@/components/sections/exercise/ExerciseEntryList';
import type { ExerciseAnalysis, ExerciseSession } from '@/types/life';
import type { ExerciseTarget } from '@/lib/exercise-targets';

// Read-only view of the exercise log: what's planned, what's been done, and the
// headline numbers. Logging and planning stay on the desktop.
export function ExerciseTab({
  planned,
  recent,
  analysis,
  targets,
  isLoading,
  error,
  onSessionChanged,
}: {
  planned: ExerciseSession[];
  recent: ExerciseSession[];
  analysis: ExerciseAnalysis | null;
  targets: ExerciseTarget[];
  isLoading: boolean;
  error: string | null;
  onSessionChanged?: () => void;
}) {
  // The session being done right now. Held here rather than refetched on every
  // tick so the gym view stays responsive between sets.
  const [active, setActive] = useState<ExerciseSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const startSession = async () => {
    setStarting(true);
    setStartError(null);
    try {
      const res = await api.startExerciseSession();
      setActive(res.session);
    } catch (err) {
      console.error('Failed to start session:', err);
      setStartError('Could not start the session.');
    } finally {
      setStarting(false);
    }
  };

  if (active) {
    return (
      <div className="space-y-4">
        <GymSession session={active} onChange={setActive} />
        <button
          type="button"
          onClick={() => {
            setActive(null);
            onSessionChanged?.();
          }}
          className="h-12 w-full rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 active:bg-gray-50"
        >
          Finish
        </button>
        <p className="pb-2 text-center text-xs text-gray-400">
          Everything is saved as you go — finishing just closes the view.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return <p className="py-10 text-center text-sm text-gray-500">Loading sessions…</p>;
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </div>
    );
  }

  const nothingAtAll = planned.length === 0 && recent.length === 0;
  if (nothingAtAll) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={startSession}
          disabled={starting}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-gray-900 text-base font-semibold text-white active:bg-gray-800 disabled:opacity-50"
        >
          <Play className="h-5 w-5" />
          {starting ? 'Opening…' : "Start today's session"}
        </button>
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-10 text-center">
          <Dumbbell className="mx-auto h-8 w-8 text-gray-400" />
          <p className="mt-3 text-sm font-medium text-gray-700">Nothing logged yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* The gym button: one tap to today's session with the weights filled in. */}
      <div>
        <button
          type="button"
          onClick={startSession}
          disabled={starting}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-gray-900 text-base font-semibold text-white active:bg-gray-800 disabled:opacity-50"
        >
          <Play className="h-5 w-5" />
          {starting ? 'Opening…' : "Start today's session"}
        </button>
        {startError && <p className="mt-2 text-sm text-red-600">{startError}</p>}
      </div>

      {analysis && analysis.totalSessions > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Sessions" value={String(analysis.totalSessions)} />
          <Stat label="Per week" value={String(analysis.sessionsPerWeek)} />
          <Stat
            label="Streak"
            value={`${analysis.currentStreakWeeks}w`}
          />
        </div>
      )}

      <TargetList targets={targets} />

      <SessionGroup
        heading="Planned"
        sessions={planned}
        empty="Nothing planned."
        dateFormat="EEE d MMM"
      />
      <SessionGroup
        heading="Recent"
        sessions={recent}
        empty="Nothing logged recently."
        dateFormat="EEE d MMM"
      />

      {analysis && analysis.suggestions.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Suggestions
          </h2>
          <ul className="space-y-2">
            {analysis.suggestions.map(suggestion => (
              <li
                key={suggestion}
                className="rounded-lg border border-gray-200 bg-white p-3 text-sm leading-6 text-gray-700 shadow-sm"
              >
                {suggestion}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// Today's targets: what to load, and why. Read-only like everything else here.
function TargetList({ targets }: { targets: ExerciseTarget[] }) {
  if (targets.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Aim for today
      </h2>
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <ul className="divide-y divide-gray-100">
          {targets.map(target => (
            <li key={target.key} className="px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-sm font-medium text-gray-900">{target.name}</span>
                <span className="flex-shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                  {[
                    target.sets && target.reps
                      ? `${target.sets} × ${target.reps}`
                      : target.sets && target.holdSeconds
                        ? `${target.sets} × ${target.holdSeconds}s`
                        : '',
                    target.weightKg !== undefined ? `${target.weightKg}kg` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">{target.rationale}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function SessionGroup({
  heading,
  sessions,
  empty,
  dateFormat,
}: {
  heading: string;
  sessions: ExerciseSession[];
  empty: string;
  dateFormat: string;
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{heading}</h2>
      {sessions.length === 0 ? (
        <p className="text-sm text-gray-400">{empty}</p>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <ul className="divide-y divide-gray-100">
            {sessions.map(session => {
              const entries = session.exercises ?? [];
              return (
                <li key={session.id} className="px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {session.label || session.type}
                      </p>
                      <p className="text-xs text-gray-500">
                        {format(parseISO(session.date), dateFormat)}
                        {session.intensity ? ` · ${session.intensity}` : ''}
                      </p>
                    </div>
                    <span className="flex-shrink-0 text-xs tabular-nums text-gray-600">
                      {session.durationMinutes ? `${session.durationMinutes} min` : ''}
                      {session.distanceKm ? ` · ${session.distanceKm} km` : ''}
                    </span>
                  </div>

                  {/* The exercises are the interesting part on a phone: this is
                      what you check standing in the gym. Read-only, like the
                      rest of the mobile view. */}
                  {entries.length > 0 && (
                    <ul className="mt-1.5 space-y-1 border-l-2 border-gray-100 pl-2.5">
                      {entries.map(entry => (
                        <li key={entry.id} className="flex items-baseline justify-between gap-2">
                          <span className="min-w-0 text-xs text-gray-700">{entry.name}</span>
                          <span className="flex-shrink-0 text-[11px] tabular-nums text-gray-500">
                            {describeEntry(entry)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-center shadow-sm">
      <div className="text-xl font-bold tabular-nums text-gray-900">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
    </div>
  );
}
