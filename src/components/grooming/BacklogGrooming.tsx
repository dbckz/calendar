'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarEventResponse, TaskMetadata } from '@/types';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { deriveTypeFieldInfo } from './helpers';
import { GroomBacklogView } from './GroomBacklogView';
import { OverdueDatesView } from './OverdueDatesView';

type SubView = 'groom' | 'overdue';

export function BacklogGrooming() {
  const toast = useToast();
  const [tasks, setTasks] = useState<CalendarEventResponse[]>([]);
  const [metadata, setMetadata] = useState<Record<string, TaskMetadata>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subView, setSubView] = useState<SubView>('groom');
  const [bootstrapping, setBootstrapping] = useState(false);
  // Bumped on a full (re)load so the groom walkthrough remounts with fresh data.
  const [dataVersion, setDataVersion] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [taskList, metaResp] = await Promise.all([
        api.getAllAsanaTasks(),
        api.getTaskMetadata(),
      ]);
      setTasks(taskList);
      setMetadata(metaResp.metadata);
      setDataVersion(v => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const typeFieldInfoByIntegration = useMemo(() => deriveTypeFieldInfo(tasks), [tasks]);

  // Backlog: incomplete tasks not yet groomed, oldest createdAt first.
  const backlog = useMemo(
    () =>
      tasks
        .filter(t => !metadata[t.id]?.groomed)
        .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')),
    [tasks, metadata]
  );

  const handleGroomed = useCallback((gid: string) => {
    setMetadata(prev => ({
      ...prev,
      [gid]: {
        ...(prev[gid] ?? { asanaTaskGid: gid, integrationId: '', updatedAt: '' }),
        groomed: true,
        groomedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }));
  }, []);

  const handleDeleted = useCallback((gid: string) => {
    setTasks(prev => prev.filter(t => t.id !== gid));
  }, []);

  const handleBootstrap = async () => {
    setBootstrapping(true);
    try {
      const res = await api.bootstrapGrooming();
      toast.success(`Bootstrap done: ${res.marked} newly groomed (${res.backlog} in backlog)`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bootstrap failed');
    } finally {
      setBootstrapping(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-sm text-gray-500">Loading tasks…</div>;
  }

  if (error) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={() => void load()}
          className="px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
          <SegBtn active={subView === 'groom'} onClick={() => setSubView('groom')}>
            Groom backlog
          </SegBtn>
          <SegBtn active={subView === 'overdue'} onClick={() => setSubView('overdue')}>
            Overdue dates
          </SegBtn>
        </div>
        <button
          onClick={handleBootstrap}
          disabled={bootstrapping}
          className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 disabled:opacity-50"
          title="Mark already-in-flight tasks (scheduled, delegated, AI-delegable) as groomed"
        >
          {bootstrapping ? 'Bootstrapping…' : 'Bootstrap groomed state'}
        </button>
      </div>

      {subView === 'groom' ? (
        <GroomBacklogView
          key={dataVersion}
          backlog={backlog}
          typeFieldInfoByIntegration={typeFieldInfoByIntegration}
          onGroomed={handleGroomed}
          onDeleted={handleDeleted}
        />
      ) : (
        <OverdueDatesView tasks={tasks} />
      )}
    </div>
  );
}

function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
        active ? 'bg-orange-600 text-white' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );
}
