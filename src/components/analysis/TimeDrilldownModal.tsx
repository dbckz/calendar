'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { format, parseISO } from 'date-fns';

import { categoryColour, formatMinutes } from './format';
import type { AnalysisEvent } from './types';

export interface DrilldownTarget {
  weekStart: string;
  integrationId: string;
  integrationName: string;
  category: string;
  minutes: number;
  events: AnalysisEvent[];
}

function eventDate(date: string): string {
  const parsed = parseISO(date);
  return Number.isNaN(parsed.getTime()) ? date : format(parsed, 'EEE d MMM');
}

// Every calendar event behind one segment of a stacked time bar, newest work
// first within each day so the longest sitting is the one you read first.
export function TimeDrilldownModal({
  target,
  onClose,
}: {
  target: DrilldownTarget | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (target) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [target, onClose]);

  if (!target) return null;

  const events = [...target.events].sort(
    (a, b) => a.date.localeCompare(b.date) || b.durationMinutes - a.durationMinutes
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-start gap-2">
            <span
              className={`w-3 h-3 mt-1.5 rounded-full flex-shrink-0 ${categoryColour(target.category)}`}
              aria-hidden="true"
            />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {target.category} — {target.integrationName}
              </h2>
              <p className="text-xs text-gray-400">
                {formatMinutes(target.minutes)} across {events.length}{' '}
                {events.length === 1 ? 'event' : 'events'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {events.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No events recorded for this category.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {events.map((event, i) => (
                <li
                  key={`${event.date}-${event.title}-${i}`}
                  className="flex items-baseline justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800 truncate">{event.title}</p>
                    <p className="text-xs text-gray-400">{eventDate(event.date)}</p>
                  </div>
                  <span className="text-sm text-gray-500 flex-shrink-0">
                    {formatMinutes(event.durationMinutes)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default TimeDrilldownModal;
