'use client';

import { useEffect } from 'react';

import { NOTIFICATIONS_STORAGE_KEY } from './useEventNotifications';
import { logicalToday, DEFAULT_ROLLOVER_HOUR } from '@/lib/date-utils';
import { NUDGE_CONTENT, selectNudge, type NudgeKind } from '@/lib/planning-nudge';
import { isWorkingDay } from '@/lib/scheduling/end-of-week';
import type { WeekStateResponse } from '@/lib/api';

// Remembers the logical day a nudge last fired on, so a reload doesn't re-nag.
const LAST_NUDGE_KEY = 'planningNudgeLastDay';

// How often to re-check. The nudges are hour-granular, so a minute is plenty and
// costs nothing.
const CHECK_INTERVAL_MS = 60_000;

/**
 * Fires the Friday wrap-up and Sunday plan-next-week reminders while the app is
 * open, through the same browser Notification path (and the same enable toggle)
 * as the event notifications. At most one per logical day; the decision itself
 * lives in lib/planning-nudge.ts.
 */
export function usePlanningNudge(
  weekState: WeekStateResponse | null,
  rolloverHour = DEFAULT_ROLLOVER_HOUR
): void {
  // No React state here: the "already nudged today" record lives in
  // localStorage, which is the thing that has to survive a reload anyway, and
  // keeping it out of state means nothing re-renders when a nudge fires.
  useEffect(() => {
    if (!weekState) return;

    const check = () => {
      // The bell governs this too: no toggle, no nudge.
      const enabled = window.localStorage.getItem(NOTIFICATIONS_STORAGE_KEY) === 'true';
      if (!enabled) return;
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

      const now = new Date();
      const today = logicalToday(now, rolloverHour);
      const stored = window.localStorage.getItem(LAST_NUDGE_KEY) ?? undefined;

      const kind: NudgeKind | null = selectNudge({
        action: weekState.action,
        now,
        nextWeekPlanned: weekState.nextWeekPlanned,
        lastNudgedDay: stored,
        logicalToday: today,
        // At 17:00+ the logical day equals the clock day (rollover is early
        // morning), so `now` is the right day to test against working days.
        isWorkingDay: isWorkingDay(now, weekState.workingDays),
      });
      if (!kind) return;

      try {
        const { title, body } = NUDGE_CONTENT[kind];
        new Notification(title, { body, tag: `planning-nudge-${today}`, icon: '/icon.svg' });
      } catch {
        // A failed notification (permission revoked mid-session) must not retry
        // in a loop, so the day is still marked below.
      }
      window.localStorage.setItem(LAST_NUDGE_KEY, today);
    };

    // Checked on a timer rather than in the effect body, so no setState happens
    // synchronously during the effect.
    const first = setTimeout(check, 0);
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [weekState, rolloverHour]);
}
