'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarEvent } from '@/types';

const STORAGE_KEY = 'eventNotificationsEnabled';

// Notify this many minutes before an event starts, plus at the start itself (0).
const OFFSETS_MINUTES = [10, 0];

// Don't schedule further out than this — events only ever span a few days,
// and this caps the number of live timers.
const HORIZON_MS = 25 * 60 * 60 * 1000;

type NotificationPermissionState = NotificationPermission | 'unsupported';

function getPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

function notificationContent(event: CalendarEvent, offsetMinutes: number): { title: string; body: string } {
  const time = event.startTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const location = event.location ? ` · ${event.location}` : '';
  if (offsetMinutes === 0) {
    return { title: `🔔 ${event.title}`, body: `Starting now${location}` };
  }
  return { title: `⏰ ${event.title}`, body: `In ${offsetMinutes} minutes (${time})${location}` };
}

/**
 * Schedules browser notifications for upcoming timed calendar events while the
 * app is open. Fires 10 minutes before and at the start of each Google event.
 * Notifications only work while a tab/PWA is open (no background push).
 */
export function useEventNotifications(events: CalendarEvent[]) {
  const [permission, setPermission] = useState<NotificationPermissionState>('unsupported');
  const [enabled, setEnabled] = useState(false);

  // key -> timeout handle for scheduled (not-yet-fired) notifications.
  const scheduledRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // keys of notifications already shown, so we never repeat one.
  const firedRef = useRef<Set<string>>(new Set());

  // Initialise from localStorage + current permission after mount.
  useEffect(() => {
    setPermission(getPermission());
    setEnabled(window.localStorage.getItem(STORAGE_KEY) === 'true');
  }, []);

  const active = enabled && permission === 'granted';

  // Reconcile the set of scheduled timers whenever events / active state change.
  useEffect(() => {
    const scheduled = scheduledRef.current;

    if (!active) {
      scheduled.forEach((handle) => clearTimeout(handle));
      scheduled.clear();
      return;
    }

    const now = Date.now();
    const wanted = new Set<string>();

    for (const event of events) {
      if (event.source !== 'google' || event.allDay) continue;
      const startMs = event.startTime.getTime();
      if (Number.isNaN(startMs)) continue;

      for (const offset of OFFSETS_MINUTES) {
        const fireAt = startMs - offset * 60 * 1000;
        const delay = fireAt - now;
        if (delay <= 0 || delay > HORIZON_MS) continue;

        // Include start time in the key so an event moved to a new time re-notifies.
        const key = `${event.id}|${startMs}|${offset}`;
        wanted.add(key);
        if (firedRef.current.has(key) || scheduled.has(key)) continue;

        const handle = setTimeout(() => {
          scheduled.delete(key);
          firedRef.current.add(key);
          try {
            const { title, body } = notificationContent(event, offset);
            new Notification(title, { body, tag: key, icon: '/icon.svg' });
          } catch {
            // Ignore notification failures (e.g. permission revoked mid-session).
          }
        }, delay);

        scheduled.set(key, handle);
      }
    }

    // Drop timers for notifications that are no longer wanted (event deleted/moved).
    for (const [key, handle] of scheduled) {
      if (!wanted.has(key)) {
        clearTimeout(handle);
        scheduled.delete(key);
      }
    }
  }, [events, active]);

  // Clear all timers on unmount.
  useEffect(() => {
    const scheduled = scheduledRef.current;
    return () => {
      scheduled.forEach((handle) => clearTimeout(handle));
      scheduled.clear();
    };
  }, []);

  const toggle = useCallback(async () => {
    if (permission === 'unsupported') return;

    if (enabled) {
      setEnabled(false);
      window.localStorage.setItem(STORAGE_KEY, 'false');
      return;
    }

    let currentPermission = permission;
    if (currentPermission !== 'granted') {
      currentPermission = await Notification.requestPermission();
      setPermission(currentPermission);
    }
    if (currentPermission === 'granted') {
      setEnabled(true);
      window.localStorage.setItem(STORAGE_KEY, 'true');
    }
  }, [enabled, permission]);

  return {
    supported: permission !== 'unsupported',
    permission,
    enabled: active,
    denied: permission === 'denied',
    toggle,
  };
}
