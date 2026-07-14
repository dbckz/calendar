'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { TaskMetadata } from '@/types';
import { api } from '@/lib/api';

interface UseTaskMetadataReturn {
  metadataByGid: Record<string, TaskMetadata>;
  isLoading: boolean;
  reload: () => Promise<void>;
  saveMetadata: (
    asanaTaskGid: string,
    integrationId: string,
    updates: Partial<Omit<TaskMetadata, 'asanaTaskGid' | 'integrationId' | 'updatedAt'>>
  ) => Promise<void>;
}

export function useTaskMetadata(): UseTaskMetadataReturn {
  const [metadataByGid, setMetadataByGid] = useState<Record<string, TaskMetadata>>({});
  const [isLoading, setIsLoading] = useState(true);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    try {
      const { metadata } = await api.getTaskMetadata();
      if (isMountedRef.current) setMetadataByGid(metadata || {});
    } catch (err) {
      console.error('Failed to load task metadata:', err);
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const saveMetadata = useCallback(async (
    asanaTaskGid: string,
    integrationId: string,
    updates: Partial<Omit<TaskMetadata, 'asanaTaskGid' | 'integrationId' | 'updatedAt'>>
  ) => {
    // Optimistic merge
    const previous = metadataByGid[asanaTaskGid];
    const optimistic: TaskMetadata = {
      ...previous,
      ...updates,
      asanaTaskGid,
      integrationId,
      updatedAt: new Date().toISOString(),
    };
    setMetadataByGid(prev => ({ ...prev, [asanaTaskGid]: optimistic }));

    try {
      const { metadata } = await api.upsertTaskMetadata(asanaTaskGid, integrationId, updates);
      setMetadataByGid(prev => ({ ...prev, [asanaTaskGid]: metadata }));
    } catch (err) {
      // Rollback on failure
      setMetadataByGid(prev => {
        const next = { ...prev };
        if (previous) {
          next[asanaTaskGid] = previous;
        } else {
          delete next[asanaTaskGid];
        }
        return next;
      });
      console.error('Failed to save task metadata:', err);
      throw err;
    }
  }, [metadataByGid]);

  return { metadataByGid, isLoading, reload, saveMetadata };
}
