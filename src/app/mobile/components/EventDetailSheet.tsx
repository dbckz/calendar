'use client';

import { format } from 'date-fns';
import { CalendarDays, Clock, MapPin, X } from 'lucide-react';
import { SOURCE_STYLES, formatTimeRange, fullDescription, sourceLabel } from '@/lib/event-display';
import { CalendarEvent } from '@/types';

function renderLinkedText(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, index) => {
    if (!part.match(/^https?:\/\//)) return part;

    return (
      <a
        key={`${part}-${index}`}
        href={part}
        target="_blank"
        rel="noreferrer"
        className="text-blue-700 underline underline-offset-2"
      >
        {part}
      </a>
    );
  });
}

export function EventDetailSheet({
  event,
  onClose,
}: {
  event: CalendarEvent;
  onClose: () => void;
}) {
  const description = fullDescription(event.description);
  const sourceStyle = SOURCE_STYLES[event.source];
  const customFields = event.customFields?.filter(field => field.displayValue) || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-3 py-[max(0.75rem,env(safe-area-inset-bottom))]"
      onClick={onClose}
    >
      <div
        className="mx-auto flex max-h-[min(82dvh,42rem)] w-full max-w-xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl"
        onClick={(eventClick) => eventClick.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-6 text-gray-950">{event.title}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={`rounded-full border px-2 py-1 text-xs font-medium ${sourceStyle.className}`}>
                {sourceLabel(event)}
              </span>
              {event.completed && (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                  Complete
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain p-4">
          <dl className="space-y-3 text-sm">
            <div className="flex gap-3">
              <dt className="flex w-8 flex-shrink-0 justify-center pt-0.5 text-gray-400">
                <Clock className="h-4 w-4" />
              </dt>
              <dd className="min-w-0 flex-1 text-gray-800">
                <div>{format(event.startTime, 'EEEE, MMMM d, yyyy')}</div>
                <div>{formatTimeRange(event)}</div>
              </dd>
            </div>

            {event.location && (
              <div className="flex gap-3">
                <dt className="flex w-8 flex-shrink-0 justify-center pt-0.5 text-gray-400">
                  <MapPin className="h-4 w-4" />
                </dt>
                <dd className="min-w-0 flex-1 break-words text-gray-800">{event.location}</dd>
              </div>
            )}

            {(event.calendarName || event.integrationName || event.assignee) && (
              <div className="flex gap-3">
                <dt className="flex w-8 flex-shrink-0 justify-center pt-0.5 text-gray-400">
                  <CalendarDays className="h-4 w-4" />
                </dt>
                <dd className="min-w-0 flex-1 space-y-1 text-gray-800">
                  {event.integrationName && <div>{event.integrationName}</div>}
                  {event.calendarName && <div>{event.calendarName}</div>}
                  {event.assignee && <div>{event.assignee}</div>}
                </dd>
              </div>
            )}
          </dl>

          {description && (
            <section className="mt-5 border-t border-gray-200 pt-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Description</h3>
              <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-gray-800">
                {renderLinkedText(description)}
              </div>
            </section>
          )}

          {event.projects && event.projects.length > 0 && (
            <section className="mt-5 border-t border-gray-200 pt-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Projects</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {event.projects.map(project => (
                  <span key={project.gid} className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-sm text-gray-700">
                    {project.name}
                  </span>
                ))}
              </div>
            </section>
          )}

          {customFields.length > 0 && (
            <section className="mt-5 border-t border-gray-200 pt-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Fields</h3>
              <dl className="mt-2 space-y-2 text-sm">
                {customFields.map(field => (
                  <div key={field.gid} className="flex justify-between gap-4">
                    <dt className="text-gray-500">{field.name}</dt>
                    <dd className="text-right font-medium text-gray-800">{field.displayValue}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
