'use client';

import { useCallback, useEffect, useState } from 'react';
import { format, subDays } from 'date-fns';

import { api } from '@/lib/api';
import { periodKeyFor } from '@/lib/goal-periods';
import type { ExerciseAnalysis, ExerciseSession, GoalWithProgress } from '@/types/life';
import type { Experiment, WellbeingAnalysis } from '@/types/wellbeing';

// Read-only feeds for the life-area views: the current month's and quarter's
// goals with their pacing, and the exercise log with its analysis.
//
// Fetched lazily — `enabled` is false until the tab is actually opened — because
// resolving goal evidence can mean an Asana round trip per goal, which is not
// something the phone view should pay for on load.

export function useGoalsOverview(enabled: boolean): {
  monthItems: GoalWithProgress[];
  quarterItems: GoalWithProgress[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [monthItems, setMonthItems] = useState<GoalWithProgress[]>([]);
  const [quarterItems, setQuarterItems] = useState<GoalWithProgress[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only the first open pays the loading state; later opens refresh quietly.
  const [hasLoaded, setHasLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!hasLoaded) setIsLoading(true);
    setError(null);
    try {
      const now = new Date();
      const [months, quarters] = await Promise.all([
        api.getGoals({ periodKind: 'month', periodKey: periodKeyFor('month', now), withProgress: true }),
        api.getGoals({
          periodKind: 'quarter',
          periodKey: periodKeyFor('quarter', now),
          withProgress: true,
        }),
      ]);
      setMonthItems(months.items ?? []);
      setQuarterItems(quarters.items ?? []);
      setHasLoaded(true);
    } catch (err) {
      console.error('Failed to load goals overview:', err);
      setError('Could not load goals.');
    } finally {
      setIsLoading(false);
    }
  }, [hasLoaded]);

  useEffect(() => {
    if (enabled) refresh();
    // `refresh` changes once when hasLoaded flips; re-running then is harmless
    // and keeps the first open's data fresh.
  }, [enabled, refresh]);

  return { monthItems, quarterItems, isLoading, error, refresh };
}

// Six months of history is enough for the phone's "recent" list and comfortably
// covers the analysis window the API defaults to.
const HISTORY_DAYS = 183;
// How many past sessions the phone lists before it becomes a scroll chore.
const RECENT_LIMIT = 10;

export function useExerciseOverview(enabled: boolean): {
  planned: ExerciseSession[];
  recent: ExerciseSession[];
  analysis: ExerciseAnalysis | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [sessions, setSessions] = useState<ExerciseSession[]>([]);
  const [analysis, setAnalysis] = useState<ExerciseAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Today's targets aren't fetched here: the Today checklist owns them (see
  // useTodaySession), so this feed is just the read-only summary below it.
  const refresh = useCallback(async () => {
    if (!hasLoaded) setIsLoading(true);
    setError(null);
    try {
      const [sessionsRes, analysisRes] = await Promise.all([
        api.getExerciseSessions(format(subDays(new Date(), HISTORY_DAYS), 'yyyy-MM-dd')),
        api.getExerciseAnalysis().catch(() => null),
      ]);
      setSessions(sessionsRes.sessions);
      setAnalysis(analysisRes?.analysis ?? null);
      setHasLoaded(true);
    } catch (err) {
      console.error('Failed to load exercise overview:', err);
      setError('Could not load the exercise log.');
    } finally {
      setIsLoading(false);
    }
  }, [hasLoaded]);

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  const today = format(new Date(), 'yyyy-MM-dd');
  const planned = sessions
    .filter(s => s.planned && !s.completed && s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const recent = sessions
    .filter(s => s.completed)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, RECENT_LIMIT);

  return { planned, recent, analysis, isLoading, error, refresh };
}

export function useWellbeingOverview(enabled: boolean): {
  analysis: WellbeingAnalysis | null;
  experiments: Experiment[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [analysis, setAnalysis] = useState<WellbeingAnalysis | null>(null);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!hasLoaded) setIsLoading(true);
    setError(null);
    try {
      const [analysisRes, experimentsRes] = await Promise.all([
        api.getWellbeingAnalysis(),
        api.getExperiments(),
      ]);
      setAnalysis(analysisRes.analysis);
      setExperiments(experimentsRes.experiments);
      setHasLoaded(true);
    } catch (err) {
      console.error('Failed to load wellbeing overview:', err);
      setError('Could not load your wellbeing data.');
    } finally {
      setIsLoading(false);
    }
  }, [hasLoaded]);

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  return { analysis, experiments, isLoading, error, refresh };
}
