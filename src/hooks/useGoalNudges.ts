'use client';

import { useCallback, useEffect, useState } from 'react';

import { api } from '@/lib/api';
import type { GoalNudge } from '@/lib/goal-progress';

// Goals past halfway through their period with nothing to show, behind pace, or
// self-reported stalled. Drives the Command Center card and the Goals section's
// badge, so both read from one fetch rather than each polling.
export function useGoalNudges(): {
  nudges: GoalNudge[];
  isLoading: boolean;
  refresh: () => void;
} {
  const [nudges, setNudges] = useState<GoalNudge[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.getGoalNudges();
      setNudges(res.nudges);
    } catch (err) {
      // The endpoint already swallows its own errors; this catches a network
      // failure. Nudges are advisory, so an empty list is a safe fallback.
      console.error('Failed to load goal nudges:', err);
      setNudges([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { nudges, isLoading, refresh };
}
