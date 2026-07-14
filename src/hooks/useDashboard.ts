'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api, DashboardCapacityResponse } from '@/lib/api';

interface UseDashboardReturn {
  data: DashboardCapacityResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

// Stale-while-revalidate cache: the capacity endpoint recomputes from Asana +
// the schedule and is slow, so we render the last known result instantly on load
// and refresh it in the background. The category rows in particular then appear
// immediately instead of waiting for the round-trip.
const CACHE_KEY = 'dashboard-capacity-cache-v1';

function readCache(): DashboardCapacityResponse | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as DashboardCapacityResponse) : null;
  } catch {
    return null;
  }
}

export function useDashboard(): UseDashboardReturn {
  const [data, setData] = useState<DashboardCapacityResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchData = useCallback(async (useCache = false) => {
    setError(null);
    // Paint the last-known result instantly (client-only; done here rather than
    // synchronously in the effect body to avoid a cascading-render lint error).
    if (useCache) {
      const cached = readCache();
      if (cached && isMountedRef.current) {
        setData(cached);
        setIsLoading(false);
      }
    }
    try {
      const result = await api.getDashboardCapacity();
      if (isMountedRef.current) setData(result);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(result)); } catch { /* quota/SSR */ }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      }
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}
