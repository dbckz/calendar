'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { DEFAULT_ROLLOVER_HOUR } from '@/lib/date-utils';
import {
  attributeMinutes,
  buildMeetingWorkspaceByTitle,
  buildWorkspaceCalendarMap,
} from '@/lib/time-attribution';
import { CalendarEvent, EventAttributionRule, SettingsResponse } from '@/types';

interface UseTimeAttributionReturn {
  rolloverHour: number;
  // The events built by buildTimedEvents for the loaded rollover hour, exposed
  // so callers (e.g. the Today card) render exactly what was attributed.
  todayTimedEvents: CalendarEvent[];
  timeWorkedByIntegration: Record<string, number>;
  timeScheduledByIntegration: Record<string, number>;
}

// Per-workspace worked/scheduled minutes for a day's timed events, condensed
// from the desktop wiring in src/app/page.tsx (without its time-tracking
// recording side-effect, which stays desktop-only). Loads the workflow config
// (rollover hour + per-sub-calendar workspace map), stored attribution rules,
// and manual Google-event attributions, then attributes the given events.
export function useTimeAttribution(
  settings: SettingsResponse | null,
  // The whole loaded calendar window — a prep block's meeting may be on a
  // different day than the prep itself.
  googleEvents: CalendarEvent[],
  // Builds the day's timed events to attribute (typically logical today's).
  // Takes the rollover hour because "today" depends on it, and the hook owns
  // loading it from the workflow config.
  buildTimedEvents: (rolloverHour: number) => CalendarEvent[]
): UseTimeAttributionReturn {
  const [rolloverHour, setRolloverHour] = useState(DEFAULT_ROLLOVER_HOUR);
  const [calendarWorkspaceMap, setCalendarWorkspaceMap] = useState<Record<string, string>>({});
  const [attributionRules, setAttributionRules] = useState<EventAttributionRule[]>([]);
  const [googleEventAttributions, setGoogleEventAttributions] = useState<
    Record<string, { asanaIntegrationId: string; googleIntegrationId: string }>
  >({});

  useEffect(() => {
    api.getWorkflowConfig()
      .then(config => {
        setRolloverHour(config.scheduling.dayRolloverHour ?? DEFAULT_ROLLOVER_HOUR);
        setCalendarWorkspaceMap(config.scheduling.calendarWorkspaceMap ?? {});
      })
      .catch(err => console.error('Failed to load workflow config:', err));
  }, []);

  // The built-in rules apply without this (they live in code), so a load
  // failure degrades gracefully.
  useEffect(() => {
    api.getAttributionRules()
      .then(res => setAttributionRules(res.rules))
      .catch(err => console.error('Failed to load attribution rules:', err));
  }, []);

  useEffect(() => {
    api.getGoogleEventAttributions()
      .then(data => {
        const map: Record<string, { asanaIntegrationId: string; googleIntegrationId: string }> = {};
        for (const attr of data.attributions) {
          map[attr.googleEventId] = {
            asanaIntegrationId: attr.asanaIntegrationId,
            googleIntegrationId: attr.googleIntegrationId,
          };
        }
        setGoogleEventAttributions(map);
      })
      .catch(err => console.error('Failed to load Google event attributions:', err));
  }, []);

  const attributionContext = useMemo(() => {
    const base = {
      map: buildWorkspaceCalendarMap(settings?.asanaIntegrations ?? [], calendarWorkspaceMap),
      attributionByEventId: googleEventAttributions,
      attributionRules,
    };
    return {
      ...base,
      meetingWorkspaceByNormalizedTitle: buildMeetingWorkspaceByTitle(googleEvents, base),
    };
  }, [settings, calendarWorkspaceMap, googleEventAttributions, attributionRules, googleEvents]);

  // A minute-resolution clock, held in state (not read during render) so the
  // figures stay pure and tick on their own.
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const timedEvents = useMemo(() => buildTimedEvents(rolloverHour), [buildTimedEvents, rolloverHour]);

  const attributed = useMemo(
    () => attributeMinutes(timedEvents, attributionContext, nowMs),
    [timedEvents, attributionContext, nowMs]
  );

  return {
    rolloverHour,
    todayTimedEvents: timedEvents,
    timeWorkedByIntegration: attributed.worked,
    timeScheduledByIntegration: attributed.scheduled,
  };
}
