'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, format, isSameDay, startOfDay, subDays } from 'date-fns';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  RefreshCw,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { containsHtml, htmlToReadableText } from '@/lib/html-utils';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { useTasks } from '@/hooks/useTasks';
import { CalendarEvent, Reminder, SettingsResponse } from '@/types';

const SOURCE_STYLES: Record<CalendarEvent['source'], { label: string; className: string; dot: string }> = {
  google: {
    label: 'Google',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
  },
  asana: {
    label: 'Asana',
    className: 'bg-orange-50 text-orange-700 border-orange-200',
    dot: 'bg-orange-500',
  },
  adhoc: {
    label: 'Task',
    className: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
    dot: 'bg-fuchsia-500',
  },
};

const EVENT_OPEN_DELAY_MS = 200;
const DOUBLE_TAP_WINDOW_MS = 220;
const EVENT_OPEN_SUPPRESSION_MS = 240;

const MOBILE_COLOR_SCHEMES = [
  {
    name: 'Slate',
    headerBg: 'bg-gradient-to-r from-slate-600 to-slate-700',
    headerBorder: 'border-slate-500/40',
    subText: 'text-slate-100/80',
  },
  {
    name: 'Ocean',
    headerBg: 'bg-gradient-to-r from-blue-500 to-blue-600',
    headerBorder: 'border-blue-300/40',
    subText: 'text-blue-50/80',
  },
  {
    name: 'Forest',
    headerBg: 'bg-gradient-to-r from-emerald-500 to-emerald-600',
    headerBorder: 'border-emerald-300/40',
    subText: 'text-emerald-50/80',
  },
  {
    name: 'Lavender',
    headerBg: 'bg-gradient-to-r from-violet-500 to-violet-600',
    headerBorder: 'border-violet-300/40',
    subText: 'text-violet-50/80',
  },
  {
    name: 'Rose',
    headerBg: 'bg-gradient-to-r from-rose-500 to-rose-600',
    headerBorder: 'border-rose-300/40',
    subText: 'text-rose-50/80',
  },
  {
    name: 'Amber',
    headerBg: 'bg-gradient-to-r from-amber-500 to-amber-600',
    headerBorder: 'border-amber-300/40',
    subText: 'text-amber-50/90',
  },
];

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  return Boolean(
    target.closest('button, a, input, textarea, select, [role="button"]')
  );
}

function isEventOpenTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  return Boolean(target.closest('[data-event-open-trigger="true"]'));
}

function isEventOnDate(event: CalendarEvent, targetDate: string): boolean {
  const startDateStr = format(event.startTime, 'yyyy-MM-dd');
  const endDateStr = format(event.endTime, 'yyyy-MM-dd');

  if (event.allDay) {
    return targetDate >= startDateStr && targetDate < endDateStr;
  }

  return startDateStr === targetDate;
}

function formatTimeRange(event: CalendarEvent): string {
  if (event.allDay) return 'All day';
  return `${format(event.startTime, 'h:mm a')} - ${format(event.endTime, 'h:mm a')}`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;

  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

function plainDescription(description?: string): string {
  if (!description) return '';

  const text = containsHtml(description) ? htmlToReadableText(description) : description;
  return text.replace(/\s+/g, ' ').trim();
}

function fullDescription(description?: string): string {
  if (!description) return '';

  return containsHtml(description) ? htmlToReadableText(description) : description.trim();
}

function getDayLabel(date: Date): string {
  const today = new Date();
  if (isSameDay(date, today)) return 'Today';
  if (isSameDay(date, subDays(today, 1))) return 'Yesterday';
  if (isSameDay(date, addDays(today, 1))) return 'Tomorrow';
  return format(date, 'EEE, MMM d');
}

function sourceLabel(event: CalendarEvent): string {
  return event.integrationName || event.calendarName || SOURCE_STYLES[event.source].label;
}

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

function MobileEventCard({
  event,
  onSelect,
}: {
  event: CalendarEvent;
  onSelect: (event: CalendarEvent) => void;
}) {
  const description = plainDescription(event.description);
  const sourceStyle = SOURCE_STYLES[event.source];

  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      data-event-open-trigger="true"
      className="w-full rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm transition-colors active:bg-gray-50"
      style={{ borderLeftColor: event.color || undefined, borderLeftWidth: '4px' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3
            className={`text-base font-semibold leading-snug text-gray-950 ${
              event.completed ? 'line-through text-gray-500' : ''
            }`}
          >
            {event.title}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-4 w-4 text-gray-400" />
              {formatTimeRange(event)}
            </span>
            {event.location && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin className="h-4 w-4 flex-shrink-0 text-gray-400" />
                <span className="truncate">{event.location}</span>
              </span>
            )}
          </div>
        </div>
        <span
          className={`flex-shrink-0 rounded-full border px-2 py-1 text-xs font-medium ${sourceStyle.className}`}
        >
          {sourceLabel(event)}
        </span>
      </div>

      {description && (
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-gray-600">{description}</p>
      )}
    </button>
  );
}

function EventDetailSheet({
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
        className="mx-auto flex max-h-[min(82vh,42rem)] w-full max-w-xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl"
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

        <div className="overflow-y-auto p-4">
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

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-10 text-center">
      <CalendarDays className="mx-auto h-8 w-8 text-gray-400" />
      <p className="mt-3 text-sm font-medium text-gray-700">No timed events</p>
    </div>
  );
}

export function MobilePlanner() {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [colorSchemeIndex, setColorSchemeIndex] = useState(0);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [updatingReminderIds, setUpdatingReminderIds] = useState<Set<string>>(() => new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number; side: 'left' | 'right' } | null>(null);
  const pendingEventOpenTimeoutRef = useRef<number | null>(null);
  const suppressNextEventOpenRef = useRef(false);

  const { getTasksForDate } = useTasks();
  const {
    googleEvents,
    allAsanaTasks,
    scheduledAsanaTasks,
    isLoading,
    fetchAllEvents,
    fetchEventsForDate,
    adhocToCalendarEvent,
    getScheduledAsanaEventsForDate,
    asanaIntegrations,
  } = useCalendarEvents();

  const loadSettings = useCallback(async () => {
    try {
      setSettingsError(null);
      const [settingsData, remindersData] = await Promise.all([
        api.getSettings(),
        api.getReminders(),
      ]);
      setSettings(settingsData);
      setReminders(remindersData.reminders);
    } catch (error) {
      console.error('Failed to load mobile planner settings:', error);
      setSettingsError('Unable to load planner settings');
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setColorSchemeIndex(Math.floor(Math.random() * MOBILE_COLOR_SCHEMES.length));
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    return () => {
      if (pendingEventOpenTimeoutRef.current) {
        window.clearTimeout(pendingEventOpenTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    fetchEventsForDate(selectedDate);
  }, [fetchEventsForDate, selectedDate]);

  useEffect(() => {
    if (!selectedEvent) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedEvent(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedEvent]);

  const dateKey = useMemo(() => format(selectedDate, 'yyyy-MM-dd'), [selectedDate]);

  const allEvents = useMemo(() => {
    const filteredGoogleEvents = googleEvents
      .filter(event => isEventOnDate(event, dateKey))
      .map(event => {
        const linkedAsana = scheduledAsanaTasks.find(s => s.googleEventId === event.id);
        if (!linkedAsana) return event;

        return {
          ...event,
          linkedAsanaTaskId: linkedAsana.asanaTaskId,
          linkedAsanaIntegrationId: linkedAsana.integrationId,
          color: '#f06a6a',
        };
      });

    const adhocEvents = getTasksForDate(dateKey)
      .filter(task => task.dueTime && !task.googleEventId)
      .map(adhocToCalendarEvent);

    const scheduledAsanaEvents = getScheduledAsanaEventsForDate(dateKey).filter(event => {
      const schedule = scheduledAsanaTasks.find(s => s.id === event.id);
      return !schedule?.googleEventId;
    });

    return [...filteredGoogleEvents, ...adhocEvents, ...scheduledAsanaEvents];
  }, [
    adhocToCalendarEvent,
    dateKey,
    getScheduledAsanaEventsForDate,
    getTasksForDate,
    googleEvents,
    scheduledAsanaTasks,
  ]);

  const allDayEvents = useMemo(
    () => allEvents.filter(event => event.allDay),
    [allEvents]
  );

  const timedEvents = useMemo(
    () => allEvents
      .filter(event => !event.allDay)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime()),
    [allEvents]
  );

  const dueTodayTasks = useMemo(() => {
    const todayStart = startOfDay(selectedDate).getTime();

    return allAsanaTasks
      .filter(task => !task.completed)
      .filter(task => task.dueOn === dateKey || task.startOn === dateKey)
      .filter(task => !scheduledAsanaTasks.some(schedule => schedule.asanaTaskId === task.id && schedule.scheduledDate === dateKey))
      .sort((a, b) => {
        const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : todayStart;
        const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : todayStart;
        return aCreated - bCreated;
      });
  }, [allAsanaTasks, dateKey, scheduledAsanaTasks, selectedDate]);

  const activeReminders = useMemo(
    () => reminders.filter(reminder => !reminder.completed),
    [reminders]
  );

  const connectedCount = useMemo(() => {
    if (!settings) return 0;
    const google = settings.googleIntegrations.filter(item => item.enabled && item.connected).length;
    const asana = settings.asanaIntegrations.filter(item => item.enabled && item.connected).length;
    return google + asana;
  }, [settings]);

  const timeWorkedByIntegration = useMemo(() => {
    const totals: Record<string, number> = {};

    for (const event of timedEvents) {
      const integrationId = event.linkedAsanaIntegrationId || (event.source === 'asana' ? event.integrationId : null);
      if (!integrationId) continue;

      const minutes = (event.endTime.getTime() - event.startTime.getTime()) / 60000;
      totals[integrationId] = (totals[integrationId] || 0) + minutes;
    }

    return totals;
  }, [timedEvents]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([fetchAllEvents(), loadSettings()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchAllEvents, loadSettings]);

  const prevDay = subDays(selectedDate, 1);
  const nextDay = addDays(selectedDate, 1);
  const showLoading = isLoading || isRefreshing;
  const colorScheme = MOBILE_COLOR_SCHEMES[colorSchemeIndex];

  const cancelPendingEventOpen = useCallback(() => {
    if (pendingEventOpenTimeoutRef.current) {
      window.clearTimeout(pendingEventOpenTimeoutRef.current);
      pendingEventOpenTimeoutRef.current = null;
    }
  }, []);

  const handleEventSelect = useCallback((event: CalendarEvent) => {
    if (suppressNextEventOpenRef.current) return;

    cancelPendingEventOpen();
    pendingEventOpenTimeoutRef.current = window.setTimeout(() => {
      pendingEventOpenTimeoutRef.current = null;
      setSelectedEvent(event);
    }, EVENT_OPEN_DELAY_MS);
  }, [cancelPendingEventOpen]);

  const handlePagePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (selectedEvent) return;
    if (isInteractiveTarget(event.target) && !isEventOpenTarget(event.target)) return;

    const side = event.clientX < window.innerWidth / 2 ? 'left' : 'right';
    const now = window.performance.now();
    const lastTap = lastTapRef.current;

    if (
      lastTap &&
      lastTap.side === side &&
      now - lastTap.time < DOUBLE_TAP_WINDOW_MS &&
      Math.abs(event.clientX - lastTap.x) < 40 &&
      Math.abs(event.clientY - lastTap.y) < 40
    ) {
      event.preventDefault();
      cancelPendingEventOpen();
      suppressNextEventOpenRef.current = true;
      window.setTimeout(() => {
        suppressNextEventOpenRef.current = false;
      }, EVENT_OPEN_SUPPRESSION_MS);
      lastTapRef.current = null;
      setSelectedDate(currentDate => side === 'left' ? subDays(currentDate, 1) : addDays(currentDate, 1));
      return;
    }

    lastTapRef.current = {
      time: now,
      x: event.clientX,
      y: event.clientY,
      side,
    };
  }, [cancelPendingEventOpen, selectedEvent]);

  const handleCompleteReminder = useCallback(async (reminder: Reminder) => {
    setUpdatingReminderIds(prev => {
      const next = new Set(prev);
      next.add(reminder.id);
      return next;
    });
    setReminders(prev => prev.map(item => item.id === reminder.id ? { ...item, completed: true } : item));

    try {
      await api.updateReminder(reminder.id, { completed: true });
    } catch (error) {
      console.error('Failed to complete reminder:', error);
      setReminders(prev => prev.map(item => item.id === reminder.id ? reminder : item));
    } finally {
      setUpdatingReminderIds(prev => {
        const next = new Set(prev);
        next.delete(reminder.id);
        return next;
      });
    }
  }, []);

  return (
    <div
      className="min-h-screen touch-manipulation bg-slate-100 text-gray-950"
      onPointerUp={handlePagePointerUp}
    >
      <header className={`sticky top-0 z-20 border-b text-white ${colorScheme.headerBg} ${colorScheme.headerBorder}`}>
        <div className="mx-auto max-w-xl px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className={`text-xs font-medium uppercase tracking-wide ${colorScheme.subText}`}>Daily Planner</p>
              <h1 className="truncate text-xl font-semibold">Dave&apos;s Calendar</h1>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={showLoading}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-60"
              aria-label="Refresh"
            >
              <RefreshCw className={`h-5 w-5 ${showLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedDate(prevDay)}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md bg-white/10 text-white transition-colors hover:bg-white/20"
              aria-label="Previous day"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(new Date())}
              className="min-w-0 flex-1 rounded-md bg-white px-3 py-2 text-center text-slate-950 shadow-sm"
            >
              <span className="block text-base font-semibold">{getDayLabel(selectedDate)}</span>
              <span className="block text-xs text-slate-500">{format(selectedDate, 'EEEE, MMMM d')}</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(nextDay)}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md bg-white/10 text-white transition-colors hover:bg-white/20"
              aria-label="Next day"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-200">
            <span className="rounded-full bg-white/10 px-2.5 py-1">
              {settingsError || `${connectedCount} connected`}
            </span>
            <span className="rounded-full bg-white/10 px-2.5 py-1">Mobile view</span>
            {asanaIntegrations.map(integration => {
              const minutes = timeWorkedByIntegration[integration.id] || 0;
              if (minutes === 0) return null;
              return (
                <span key={integration.id} className="rounded-full bg-white/10 px-2.5 py-1">
                  {integration.name}: {formatDuration(minutes)}
                </span>
              );
            })}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-4 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        {showLoading && (
          <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
            <Loader2 className="h-4 w-4 animate-spin" />
            Syncing planner data
          </div>
        )}

        {allDayEvents.length > 0 && (
          <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <CalendarDays className="h-4 w-4 text-gray-500" />
              All-day
            </div>
            <div className="flex flex-wrap gap-2">
              {allDayEvents.map(event => (
                <button
                  type="button"
                  key={`${event.integrationId || event.source}-${event.id}`}
                  onClick={() => handleEventSelect(event)}
                  data-event-open-trigger="true"
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-transform active:scale-95 ${SOURCE_STYLES[event.source].className}`}
                >
                  {event.title}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Agenda</h2>
            <span className="text-sm text-gray-500">{timedEvents.length}</span>
          </div>
          {timedEvents.length > 0 ? (
            timedEvents.map(event => (
              <MobileEventCard
                key={`${event.integrationId || event.source}-${event.id}`}
                event={event}
                onSelect={handleEventSelect}
              />
            ))
          ) : (
            <EmptyState />
          )}
        </section>

        {dueTodayTasks.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Asana Today</h2>
              <span className="text-sm text-gray-500">{dueTodayTasks.length}</span>
            </div>
            {dueTodayTasks.slice(0, 12).map(task => (
              <article key={`${task.integrationId || 'asana'}-${task.id}`} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className={`mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full ${SOURCE_STYLES.asana.dot}`} />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold leading-6 text-gray-950">{task.title}</h3>
                    <p className="mt-1 text-xs text-gray-500">
                      {[task.integrationName, task.dueOn ? `Due ${task.dueOn}` : null, task.startOn ? `Starts ${task.startOn}` : null]
                        .filter(Boolean)
                        .join(' | ')}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}

        {activeReminders.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Reminders</h2>
              <span className="text-sm text-gray-500">{activeReminders.length}</span>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
              <div className="space-y-3">
                {activeReminders.map(reminder => (
                  <div key={reminder.id} className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => handleCompleteReminder(reminder)}
                      disabled={updatingReminderIds.has(reminder.id)}
                      className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-emerald-600 transition-colors hover:bg-emerald-50 disabled:opacity-50"
                      aria-label={`Mark ${reminder.text} done`}
                    >
                      {updatingReminderIds.has(reminder.id) ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-5 w-5" />
                      )}
                    </button>
                    <p className="text-sm leading-6 text-gray-800">{reminder.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      {selectedEvent && (
        <EventDetailSheet
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}
