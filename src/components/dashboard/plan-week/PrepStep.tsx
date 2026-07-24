'use client';

import { Dispatch, SetStateAction } from 'react';
import { ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';

import type { PrepCandidatesResponse } from '@/lib/api';
import { RowSelect, PREP_LENGTH_OPTIONS, timeRange } from './helpers';

interface PrepStepProps {
  prepData: PrepCandidatesResponse | null;
  prepBusy: boolean;
  isLoading: boolean;
  showOtherMeetings: boolean;
  setShowOtherMeetings: Dispatch<SetStateAction<boolean>>;
  prepDurations: Record<string, number>;
  prepDays: Record<string, string>;
  setPrepDecision: (title: string, needsPrep: boolean) => void;
  changePrepDuration: (eventId: string, durationMinutes: number) => void;
  changePrepDay: (eventId: string, date: string) => void;
}

export function PrepStep({
  prepData,
  prepBusy,
  isLoading,
  showOtherMeetings,
  setShowOtherMeetings,
  prepDurations,
  prepDays,
  setPrepDecision,
  changePrepDuration,
  changePrepDay,
}: PrepStepProps) {
  if (!prepData) {
    return (
      <p className="text-sm text-gray-400 italic py-8 text-center">No meeting data available.</p>
    );
  }
  const suggested = prepData.meetings.filter(m => m.needsPrep && m.block);
  const others = prepData.meetings.filter(m => !m.needsPrep);
  const workingDays = prepData.workingDays ?? [];

  // Per-meeting prep-day options: every working day from now up to and
  // including the meeting's day. Labels: the meeting day is "Day of", the day
  // immediately before is "Day before", the rest are "EEE d" (e.g. "Mon 20").
  const dayOptionsFor = (meetingDate: string): Array<{ value: string; label: string }> => {
    const md = parseISO(meetingDate);
    const dayBefore = format(new Date(md.getFullYear(), md.getMonth(), md.getDate() - 1), 'yyyy-MM-dd');
    return workingDays
      .filter(d => d <= meetingDate)
      .map(d => ({
        value: d,
        label:
          d === meetingDate ? 'Day of' : d === dayBefore ? 'Day before' : format(parseISO(d), 'EEE d'),
      }));
  };

  // The meeting's day, prefixed "next" for an early-next-week meeting.
  const meetingDayLabel = (m: (typeof prepData.meetings)[number]): string => {
    const eee = format(parseISO(m.date), 'EEE');
    return m.nextWeek ? `next ${eee}` : eee;
  };

  return (
    <div className={`space-y-5 ${prepBusy ? 'opacity-60 pointer-events-none' : ''}`}>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
          Suggested prep
        </h3>
        {suggested.length === 0 ? (
          <p className="text-sm text-gray-400 italic">
            No meetings this week look like they need prep.
          </p>
        ) : (
          <ul className="space-y-2">
            {suggested.map(m => {
              const b = m.block!;
              return (
                <li
                  key={m.eventId}
                  className="flex items-start gap-3 rounded-lg border border-gray-200 p-3"
                >
                  <input
                    type="checkbox"
                    checked
                    onChange={() => setPrepDecision(m.title, false)}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                      <span className="truncate">{m.title}</span>
                      {m.nextWeek && (
                        <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-indigo-100 text-indigo-700">
                          {meetingDayLabel(m)} {m.start}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      <span className="font-medium text-slate-600">
                        {format(parseISO(b.date), 'EEE')} {timeRange(b.start, b.durationMinutes)}
                      </span>{' '}
                      · {m.reason}
                    </p>
                  </div>
                  <RowSelect
                    value={prepDurations[m.eventId] ?? 15}
                    options={PREP_LENGTH_OPTIONS}
                    onChange={v => changePrepDuration(m.eventId, Number(v))}
                    disabled={prepBusy || isLoading}
                    ariaLabel={`Prep length for ${m.title}`}
                    className="mt-0.5"
                  />
                  <RowSelect
                    value={prepDays[m.eventId] ?? b.date}
                    options={dayOptionsFor(m.date)}
                    onChange={v => changePrepDay(m.eventId, v)}
                    disabled={prepBusy || isLoading}
                    ariaLabel={`Prep day for ${m.title}`}
                    className="mt-0.5"
                  />
                </li>
              );
            })}
          </ul>
        )}
        {suggested.length > 0 && (
          <p className="mt-2 text-[11px] text-gray-400">
            Slots finalize when you press Next.
          </p>
        )}
      </div>

      {prepData.unplaced.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
          <p className="text-xs font-medium text-amber-800 mb-1">Couldn&apos;t fit prep for:</p>
          <ul className="text-xs text-amber-700 space-y-0.5">
            {prepData.unplaced.map(u => (
              <li key={u.key}>{u.title}</li>
            ))}
          </ul>
        </div>
      )}

      {others.length > 0 && (
        <div>
          <button
            onClick={() => setShowOtherMeetings(v => !v)}
            className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-600"
          >
            <ChevronRight
              className={`w-3.5 h-3.5 transition-transform ${showOtherMeetings ? 'rotate-90' : ''}`}
            />
            Other meetings ({others.length})
          </button>
          {showOtherMeetings && (
            <ul className="mt-2 space-y-2">
              {others.map(m => (
                <li
                  key={m.eventId}
                  className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3"
                >
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => setPrepDecision(m.title, true)}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">{m.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {meetingDayLabel(m)} {m.start} · add a prep block
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
