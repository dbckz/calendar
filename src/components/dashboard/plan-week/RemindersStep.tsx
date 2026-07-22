'use client';

import { Dispatch, SetStateAction } from 'react';
import { AlertTriangle, ArrowRightToLine, Bell } from 'lucide-react';

import type { AsanaProject } from '@/types';
import type { AsanaTypeFieldInfo } from '@/components/CreateAsanaTaskModal';
import type { ReminderTriageRow } from './types';

interface RemindersStepProps {
  rows: ReminderTriageRow[] | null; // null = still loading suggestions
  setRows: Dispatch<SetStateAction<ReminderTriageRow[] | null>>;
  loading: boolean;
  error: string | null;
  integrations: Array<{ id: string; name: string }>;
  projects: AsanaProject[];
  typeFieldInfoByIntegration?: Map<string, AsanaTypeFieldInfo>;
}

export function RemindersStep({
  rows,
  setRows,
  loading,
  error,
  integrations,
  projects,
  typeFieldInfoByIntegration,
}: RemindersStepProps) {
  const update = (id: string, patch: Partial<ReminderTriageRow>) =>
    setRows(prev => (prev ? prev.map(r => (r.id === id ? { ...r, ...patch } : r)) : prev));

  const typesFor = (integrationId: string): string[] => {
    const info = typeFieldInfoByIntegration?.get(integrationId);
    return info ? Array.from(info.enumOptions.keys()).sort() : [];
  };

  const projectsFor = (integrationId: string) =>
    projects.filter(p => p.integrationId === integrationId);

  if (loading || rows === null) {
    return (
      <div className="py-8 text-center text-sm text-gray-500">
        Reviewing your reminders and suggesting where each could go…
      </div>
    );
  }

  const convertCount = rows.filter(r => r.action === 'convert').length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Tidy up your reminders before planning. Keep each as a quick reminder, or convert it into an
        Asana task (with an AI-suggested workspace, project and type you can adjust). Conversions are
        applied when you add the plan to your calendar.
      </p>

      {error && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            AI suggestions weren&apos;t available — pick a workspace and details for any reminder you
            want to convert.
          </span>
        </div>
      )}

      {rows.map(row => {
        const converting = row.action === 'convert';
        const rowProjects = projectsFor(row.integrationId);
        const rowTypes = typesFor(row.integrationId);
        return (
          <div key={row.id} className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-start gap-2">
              <Bell className="w-4 h-4 mt-1 flex-shrink-0 text-gray-400" />
              <div className="flex-1 min-w-0">
                {/* Keep vs convert toggle */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <label className="flex items-center gap-1.5 text-sm text-gray-700">
                    <input
                      type="radio"
                      name={`action-${row.id}`}
                      checked={!converting}
                      onChange={() => update(row.id, { action: 'keep' })}
                      className="w-3.5 h-3.5 text-gray-500 focus:ring-gray-400"
                    />
                    Keep as reminder
                  </label>
                  <label className="flex items-center gap-1.5 text-sm text-gray-700">
                    <input
                      type="radio"
                      name={`action-${row.id}`}
                      checked={converting}
                      onChange={() => update(row.id, { action: 'convert' })}
                      className="w-3.5 h-3.5 text-orange-500 focus:ring-orange-500"
                    />
                    <ArrowRightToLine className="w-3.5 h-3.5 text-orange-500" />
                    Convert to Asana task
                  </label>
                </div>

                {!converting && (
                  <p className="mt-1 text-sm text-gray-800 truncate">{row.name}</p>
                )}

                {converting && (
                  <div className="mt-2 space-y-2">
                    <input
                      type="text"
                      value={row.name}
                      onChange={e => update(row.id, { name: e.target.value })}
                      placeholder="Task name"
                      aria-label="Task name"
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                    <textarea
                      value={row.notes}
                      onChange={e => update(row.id, { notes: e.target.value })}
                      placeholder="Notes (optional)"
                      aria-label="Notes"
                      rows={2}
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      {integrations.length > 1 && (
                        <label className="flex items-center gap-1 text-[11px] text-gray-500">
                          Workspace
                          <select
                            value={row.integrationId}
                            onChange={e =>
                              // Changing workspace invalidates the project/type picks.
                              update(row.id, {
                                integrationId: e.target.value,
                                projectGid: '',
                                taskType: '',
                              })
                            }
                            aria-label="Workspace"
                            className="text-xs border border-gray-300 rounded px-1.5 py-1 outline-none focus:ring-2 focus:ring-orange-500"
                          >
                            {integrations.map(intg => (
                              <option key={intg.id} value={intg.id}>
                                {intg.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {rowProjects.length > 0 && (
                        <label className="flex items-center gap-1 text-[11px] text-gray-500">
                          Project
                          <select
                            value={row.projectGid}
                            onChange={e => update(row.id, { projectGid: e.target.value })}
                            aria-label="Project"
                            className="text-xs border border-gray-300 rounded px-1.5 py-1 outline-none focus:ring-2 focus:ring-orange-500"
                          >
                            <option value="">No project</option>
                            {rowProjects.map(p => (
                              <option key={p.gid} value={p.gid}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {rowTypes.length > 0 && (
                        <label className="flex items-center gap-1 text-[11px] text-gray-500">
                          Type
                          <select
                            value={row.taskType}
                            onChange={e => update(row.id, { taskType: e.target.value })}
                            aria-label="Type"
                            className="text-xs border border-gray-300 rounded px-1.5 py-1 outline-none focus:ring-2 focus:ring-orange-500"
                          >
                            <option value="">No type</option>
                            {rowTypes.map(t => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label className="flex items-center gap-1 text-[11px] text-gray-500">
                        Due
                        <input
                          type="date"
                          value={row.dueOn}
                          onChange={e => update(row.id, { dueOn: e.target.value })}
                          aria-label="Due date"
                          className="text-xs border border-gray-300 rounded px-1.5 py-1 outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <p className="text-xs text-gray-400">
        {convertCount > 0
          ? `${convertCount} reminder${convertCount === 1 ? '' : 's'} will become Asana task${convertCount === 1 ? '' : 's'}; the rest stay as reminders.`
          : 'Nothing selected to convert — press Next (or Skip) to leave your reminders untouched.'}
      </p>
    </div>
  );
}
