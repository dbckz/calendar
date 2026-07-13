'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { DelegationQueueEntry } from '@/types';
import { api } from '@/lib/api';

interface UseDelegationQueueReturn {
  delegationByGid: Record<string, DelegationQueueEntry>;
  isLoading: boolean;
  refresh: () => void;
}

const POLL_MS = 20_000;

// Polls the app-owned delegation queue so the sidebar/dialog reflect enqueue,
// running, and result states as the pacer / detached runner update them.
export function useDelegationQueue(): UseDelegationQueueReturn {
  const [delegationByGid, setDelegationByGid] = useState<Record<string, DelegationQueueEntry>>({});
  const [isLoading, setIsLoading] = useState(true);
  const isMountedRef = useRef(true);

  const refresh = useCallback(() => {
    api.getDelegationQueue()
      .then(({ entries }) => {
        if (isMountedRef.current) setDelegationByGid(entries || {});
      })
      .catch(err => console.error('Failed to load delegation queue:', err))
      .finally(() => {
        if (isMountedRef.current) setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    refresh();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, POLL_MS);
    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, [refresh]);

  return { delegationByGid, isLoading, refresh };
}
