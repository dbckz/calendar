'use client';

import { Dispatch, SetStateAction } from 'react';
import { Check, AlertTriangle } from 'lucide-react';

import { categoryColor } from './helpers';
import type { MatchMeta, MatchRow } from './types';

interface PrioritiesStepProps {
  matchRows: MatchRow[] | null;
  setMatchRows: Dispatch<SetStateAction<MatchRow[] | null>>;
  priorityText: string;
  setPriorityText: Dispatch<SetStateAction<string>>;
  matchMeta: MatchMeta;
  createdTasks: Array<{ text: string; gid: string; title: string; integrationId: string }>;
}

export function PrioritiesStep({
  matchRows,
  setMatchRows,
  priorityText,
  setPriorityText,
  matchMeta,
  createdTasks,
}: PrioritiesStepProps) {
  const projectsForIntegration = (integrationId: string) =>
    matchMeta.projects.filter(p => p.integrationId === integrationId);

  const renderCategorySelect = (value: string, onChange: (v: string) => void) => (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="text-xs border border-gray-300 rounded px-1.5 py-1 outline-none focus:ring-2 focus:ring-orange-500"
    >
      {matchMeta.categories.map(c => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );

  if (matchRows === null) {
    return (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          What matters most this week? These get matched against your Asana tasks (or created as
          new ones) and scheduled first.
        </p>
        <textarea
          value={priorityText}
          onChange={e => setPriorityText(e.target.value)}
          rows={6}
          placeholder={'One priority per line…\ne.g. Finish grant report\nPrep board deck'}
          className="w-full text-sm border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none resize-none"
        />
        <p className="mt-2 text-xs text-gray-400">
          Leave blank and press Skip (or Next) to plan without pinned priorities.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {matchMeta.aiUnavailable && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            AI matching is unavailable right now — every line will be created as a new Asana task.
          </span>
        </div>
      )}
      {matchRows.map((row, i) => {
        const color = row.category ? categoryColor(row.category) : null;
        return (
          <div key={i} className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-start gap-2">
              {!row.match && (
                <input
                  type="checkbox"
                  checked={row.include}
                  onChange={() =>
                    setMatchRows(prev =>
                      prev!.map((r, j) => (j === i ? { ...r, include: !r.include } : r))
                    )
                  }
                  className="mt-1 w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{row.text}</p>
                {row.match ? (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-700">
                      <Check className="w-3 h-3" />
                      Matched: {row.match.title}
                    </span>
                    {(() => {
                      const name = matchMeta.asanaIntegrations.find(
                        i => i.id === row.match!.integrationId
                      )?.name;
                      return name ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-gray-100 text-gray-500 flex-shrink-0">
                          {name}
                        </span>
                      ) : null;
                    })()}
                    {row.match.category ? (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${color!.bg} ${color!.text}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${color!.dot}`} />
                        {row.match.category}
                      </span>
                    ) : (
                      <label className="flex items-center gap-1 text-[11px] text-gray-500">
                        Category
                        {renderCategorySelect(row.category, val =>
                          setMatchRows(prev =>
                            prev!.map((r, j) => (j === i ? { ...r, category: val } : r))
                          )
                        )}
                      </label>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-gray-400">New Asana task</span>
                    {matchMeta.asanaIntegrations.length > 1 && (
                      <select
                        value={row.createIntegrationId}
                        onChange={e =>
                          setMatchRows(prev =>
                            prev!.map((r, j) =>
                              // Integration change invalidates the chosen project.
                              j === i
                                ? { ...r, createIntegrationId: e.target.value, createProjectGid: '' }
                                : r
                            )
                          )
                        }
                        className="text-xs border border-gray-300 rounded px-1.5 py-1 outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        {matchMeta.asanaIntegrations.map(intg => (
                          <option key={intg.id} value={intg.id}>
                            {intg.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {(() => {
                      const rowProjects = projectsForIntegration(row.createIntegrationId);
                      if (rowProjects.length === 0) return null;
                      const needsProject = row.include && !row.createProjectGid;
                      return (
                        <label className="flex items-center gap-1 text-[11px] text-gray-500">
                          Project
                          <select
                            value={row.createProjectGid}
                            onChange={e =>
                              setMatchRows(prev =>
                                prev!.map((r, j) =>
                                  j === i ? { ...r, createProjectGid: e.target.value } : r
                                )
                              )
                            }
                            className={`text-xs border rounded px-1.5 py-1 outline-none focus:ring-2 focus:ring-orange-500 ${
                              needsProject ? 'border-red-400' : 'border-gray-300'
                            }`}
                          >
                            <option value="">Select project…</option>
                            {rowProjects.map(p => (
                              <option key={p.gid} value={p.gid}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      );
                    })()}
                    <label className="flex items-center gap-1 text-[11px] text-gray-500">
                      Category
                      {renderCategorySelect(row.category, val =>
                        setMatchRows(prev =>
                          prev!.map((r, j) => (j === i ? { ...r, category: val } : r))
                        )
                      )}
                    </label>
                    {row.include &&
                      projectsForIntegration(row.createIntegrationId).length > 0 &&
                      !row.createProjectGid && (
                        <p className="w-full text-[11px] text-red-500">
                          Choose a project for this new task.
                        </p>
                      )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {createdTasks.length > 0 && (
        <p className="text-xs text-gray-400">
          {createdTasks.length} new task{createdTasks.length === 1 ? '' : 's'} already created in
          Asana — they won&apos;t be recreated.
        </p>
      )}
    </div>
  );
}
