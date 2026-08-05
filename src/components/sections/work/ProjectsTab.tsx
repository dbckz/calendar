'use client';

import { useCallback, useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { AlertCircle, FolderGit2, GitBranch, RefreshCw, Upload } from 'lucide-react';

import { api, type ProjectWithSummary } from '@/lib/api';

// The side projects, and what has actually been happening in them.
//
// Ordered so unfinished business surfaces first: anything with uncommitted work
// is lifted above the merely-recent, because that is the state that gets
// forgotten. Dormant projects are hidden behind a toggle rather than dropped —
// the point is to be able to find the one you abandoned, not to pretend it
// never existed.
export function ProjectsTab() {
  const [projects, setProjects] = useState<ProjectWithSummary[]>([]);
  const [dormantCount, setDormantCount] = useState(0);
  const [includeDormant, setIncludeDormant] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (options: { refresh?: boolean } = {}) => {
      if (options.refresh) setIsRefreshing(true);
      setError(null);
      try {
        const res = await api.getProjects({ includeDormant, refresh: options.refresh });
        setProjects(res.projects);
        setDormantCount(res.dormantCount);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to scan projects.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [includeDormant]
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">Projects</h2>
          <p className="text-sm text-gray-500">
            Everything under <code className="text-xs">working_dir/github/dbckz</code>, most
            recently touched first.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={includeDormant}
              onChange={e => setIncludeDormant(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Show dormant{dormantCount > 0 && !includeDormant ? ` (${dormantCount})` : ''}
          </label>
          <button
            onClick={() => load({ refresh: true })}
            disabled={isRefreshing}
            title="Re-read every project and regenerate its summary"
            className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Rescan
          </button>
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {isLoading && <p className="text-sm text-gray-500">Scanning…</p>}

      {!isLoading && projects.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <FolderGit2 className="mx-auto h-8 w-8 text-gray-400" />
          <p className="mt-3 text-sm text-gray-600">No projects found.</p>
        </div>
      )}

      <div className="space-y-2">
        {projects.map(project => (
          <ProjectRow key={project.name} project={project} />
        ))}
      </div>
    </div>
  );
}

function ProjectRow({ project }: { project: ProjectWithSummary }) {
  const hasUnfinished = project.uncommittedFiles > 0 || project.unpushedCommits > 0;

  return (
    <div
      className={`rounded-lg border bg-white p-4 ${
        hasUnfinished ? 'border-amber-200' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-gray-900">{project.name}</h3>
            {project.dormant && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-500">
                dormant
              </span>
            )}
            {project.branch !== 'main' && project.branch !== 'master' && (
              <span className="flex items-center gap-1 text-[11px] text-gray-500">
                <GitBranch className="h-3 w-3" />
                {project.branch}
              </span>
            )}
          </div>

          {project.summary && (
            <p className="mt-1 text-sm text-gray-700">
              {project.summary.summary}
              {project.summary.source === 'status-file' && (
                <span className="ml-1.5 text-[11px] text-gray-400">from STATUS.md</span>
              )}
            </p>
          )}

          <p className="mt-1 text-xs text-gray-500">
            {project.daysSinceCommit === 0
              ? 'Committed today'
              : `${project.daysSinceCommit} day${project.daysSinceCommit === 1 ? '' : 's'} ago`}
            {' · '}
            {format(parseISO(project.lastCommitDate), 'd MMM')}
            {project.commitsLast30Days > 0 && ` · ${project.commitsLast30Days} commits in 30d`}
          </p>
          <p className="mt-0.5 truncate text-xs text-gray-400" title={project.lastCommitSubject}>
            {project.lastCommitSubject}
          </p>
        </div>

        {hasUnfinished && (
          <div className="flex flex-shrink-0 flex-col items-end gap-1">
            {project.uncommittedFiles > 0 && (
              <span className="flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                <AlertCircle className="h-3 w-3" />
                {project.uncommittedFiles} uncommitted
              </span>
            )}
            {project.unpushedCommits > 0 && (
              <span className="flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                <Upload className="h-3 w-3" />
                {project.unpushedCommits} unpushed
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
