import { addDays, format, isSameDay, subDays } from 'date-fns';
import { containsHtml, htmlToReadableText } from '@/lib/html-utils';
import { CalendarEvent } from '@/types';

export const SOURCE_STYLES: Record<CalendarEvent['source'], { label: string; className: string; dot: string }> = {
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

export function formatTimeRange(event: CalendarEvent): string {
  if (event.allDay) return 'All day';
  return `${format(event.startTime, 'h:mm a')} - ${format(event.endTime, 'h:mm a')}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;

  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

export function plainDescription(description?: string): string {
  if (!description) return '';

  const text = containsHtml(description) ? htmlToReadableText(description) : description;
  return text.replace(/\s+/g, ' ').trim();
}

export function fullDescription(description?: string): string {
  if (!description) return '';

  return containsHtml(description) ? htmlToReadableText(description) : description.trim();
}

export function getDayLabel(date: Date): string {
  const today = new Date();
  if (isSameDay(date, today)) return 'Today';
  if (isSameDay(date, subDays(today, 1))) return 'Yesterday';
  if (isSameDay(date, addDays(today, 1))) return 'Tomorrow';
  return format(date, 'EEE, MMM d');
}

export function sourceLabel(event: CalendarEvent): string {
  return event.integrationName || event.calendarName || SOURCE_STYLES[event.source].label;
}
