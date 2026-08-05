'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, FolderGit2 } from 'lucide-react';

import { api, type ProjectWithSummary } from '@/lib/api';

// Which side projects have actually moved lately, shown while deciding what
// matters this week.
//
// The failure this addresses: work happens in a repo, never becomes a task, and
// is forgotten by the next planning session. Seeing "you committed to this four
// times last week and there is no task for it" is the prompt.
//
// Deliberately advisory — it lists, it does not create. A planning step that
// silently manufactured Asana tasks from git activity would be worse than the
// problem.
const ACTIVE_WITHIN_DAYS = 7;
const MAX_SHOWN = 6;

export function ActiveProjectsPanel() {
  const [projects, setProjects] = useState<ProjectWithSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .getProjects()
      .then(res => {
        if (cancelled) return;
        setProjects(
          res.projects
            .filter(p => p.daysSinceCommit <= ACTIVE_WITHIN_DAYS || p.uncommittedFiles > 0)
            .slice(0, MAX_SHOWN)
        );
      })
      .catch(err => console.error('Failed to load active projects:', err));
    return () => {
      cancelled = true;
    };
  }, []);

  if (projects.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
        <FolderGit2 className="h-3.5 w-3.5 text-gray-500" />
        Projects you&apos;ve touched recently
      </h4>
      <p className="mt-0.5 text-[11px] text-gray-500">
        Worth a task this week? Anything with uncommitted work was left mid-change.
      </p>
      <ul className="mt-2 space-y-1.5">
        {projects.map(project => (
          <li key={project.name} className="flex items-start justify-between gap-3 text-xs">
            <span className="min-w-0">
              <span className="font-medium text-gray-800">{project.name}</span>
              {project.summary && (
                <span className="text-gray-500"> — {project.summary.summary}</span>
              )}
            </span>
            <span className="flex flex-shrink-0 items-center gap-2 text-[11px] text-gray-500">
              {project.uncommittedFiles > 0 && (
                <span className="flex items-center gap-0.5 font-semibold text-amber-700">
                  <AlertCircle className="h-3 w-3" />
                  {project.uncommittedFiles}
                </span>
              )}
              {project.daysSinceCommit === 0 ? 'today' : `${project.daysSinceCommit}d`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
