'use client';

import { Bell, BellOff, BellRing } from 'lucide-react';
import { CalendarEvent } from '@/types';
import { useEventNotifications } from '@/hooks/useEventNotifications';

interface NotificationBellProps {
  events: CalendarEvent[];
  /** When true, use light styling suitable for a coloured header background. */
  onColoredBg?: boolean;
  /** Override the button's classes entirely (e.g. to match the mobile header). */
  className?: string;
  /** Icon size classes. Defaults to w-5 h-5. */
  iconClassName?: string;
}

/**
 * Toggle button for event notifications. Owns the scheduling hook, so
 * notifications are scheduled as long as this bell is rendered.
 */
export function NotificationBell({ events, onColoredBg, className, iconClassName }: NotificationBellProps) {
  const { supported, enabled, denied, toggle } = useEventNotifications(events);

  if (!supported) return null;

  const Icon = enabled ? BellRing : BellOff;
  const label = denied
    ? 'Notifications blocked — enable them in your browser settings'
    : enabled
      ? 'Event notifications on (10 min before + at start)'
      : 'Enable event notifications';

  const base = onColoredBg
    ? 'hover:bg-white/20 text-white'
    : 'hover:bg-gray-100 text-gray-600';
  const activeTint = enabled && !onColoredBg ? 'text-blue-600' : '';
  const buttonClass = className
    ? `${className} ${denied ? 'opacity-50' : ''}`
    : `p-2 rounded-lg transition-colors ${base} ${activeTint} ${denied ? 'opacity-50' : ''}`;

  return (
    <button
      type="button"
      onClick={toggle}
      className={buttonClass}
      aria-label={label}
      title={label}
    >
      {denied
        ? <Bell className={iconClassName ?? 'w-5 h-5'} />
        : <Icon className={iconClassName ?? 'w-5 h-5'} />}
    </button>
  );
}
