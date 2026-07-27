'use client';

import { Dispatch, SetStateAction, memo, useCallback, useMemo } from 'react';
import { AlertTriangle, ArrowRightToLine, Bell, Check, Trash2 } from 'lucide-react';

import type { AsanaProject } from '@/types';
import type { AsanaTypeFieldInfo } from '@/components/CreateAsanaTaskModal';
import type { ReminderTriageRow } from './types';
import { ProjectCombobox } from './ProjectCombobox';

interface RemindersStepProps {
  rows: ReminderTriageRow[] | null; // null = still loading suggestions
  setRows: Dispatch<SetStateAction<ReminderTriageRow[] | null>>;
  loading: boolean;
  error: string | null;
  progress?: { done: number; total: number } | null;
  integrations: Array<{ id: string; name: string }>;
  projects: AsanaProject[];
  typeFieldInfoByIntegration?: Map<string, AsanaTypeFieldInfo>;
}

// Stable empty references so a row whose workspace has no projects/types keeps the
// same array identity across renders (never a fresh []), which keeps ReminderRow's
// memoization intact.
const EMPTY_PROJECTS: AsanaProject[] = [];
const EMPTY_TYPES: string[] = [];

type UpdateFn = (id: string, patch: Partial<ReminderTriageRow>) => void;

// How a non-converting row's name is styled: done and delete both strike it
// through, in their own colour; a kept reminder reads normally.
function nameClassFor(action: ReminderTriageRow['action']): string {
  switch (action) {
    case 'done':
      return 'text-gray-500 line-through';
    case 'delete':
      return 'text-red-400 line-through';
    default:
      return 'text-gray-800';
  }
}

interface ReminderRowProps {
  row: ReminderTriageRow;
  rowProjects: AsanaProject[];
  rowTypes: string[];
  integrations: Array<{ id: string; name: string }>;
  onUpdate: UpdateFn;
}

// One triage row. Wrapped in memo so that changing ONE row (setRows replaces only
// that row's object; the others keep their identity) re-renders just that row,
// not all ~37. All props are referentially stable across a sibling's change:
// `row` (unchanged rows keep identity), the memoized project/type arrays, the
// integrations prop, and the useCallback'd onUpdate. This is what makes a radio
// click feel instant even with a heavy ProjectCombobox mounted per converting row.
const ReminderRow = memo(function ReminderRow({
  row,
  rowProjects,
  rowTypes,
  integrations,
  onUpdate,
}: ReminderRowProps) {
  const converting = row.action === 'convert';
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-start gap-2">
        <Bell className="w-4 h-4 mt-1 flex-shrink-0 text-gray-400" />
        <div className="flex-1 min-w-0">
          {/* Action choice */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <label className="flex items-center gap-1.5 text-sm text-gray-700">
              <input
                type="radio"
                name={`action-${row.id}`}
                checked={row.action === 'keep'}
                onChange={() => onUpdate(row.id, { action: 'keep' })}
                className="w-3.5 h-3.5 text-gray-500 focus:ring-gray-400"
              />
              Keep as reminder
            </label>
            <label className="flex items-center gap-1.5 text-sm text-gray-700">
              <input
                type="radio"
                name={`action-${row.id}`}
                checked={converting}
                onChange={() => onUpdate(row.id, { action: 'convert' })}
                className="w-3.5 h-3.5 text-orange-500 focus:ring-orange-500"
              />
              <ArrowRightToLine className="w-3.5 h-3.5 text-orange-500" />
              Convert to Asana task
            </label>
            <label className="flex items-center gap-1.5 text-sm text-gray-700">
              <input
                type="radio"
                name={`action-${row.id}`}
                checked={row.action === 'done'}
                onChange={() => onUpdate(row.id, { action: 'done' })}
                className="w-3.5 h-3.5 text-green-600 focus:ring-green-500"
              />
              <Check className="w-3.5 h-3.5 text-green-600" />
              Mark done
            </label>
            <label className="flex items-center gap-1.5 text-sm text-gray-700">
              <input
                type="radio"
                name={`action-${row.id}`}
                checked={row.action === 'delete'}
                onChange={() => onUpdate(row.id, { action: 'delete' })}
                className="w-3.5 h-3.5 text-red-600 focus:ring-red-500"
              />
              <Trash2 className="w-3.5 h-3.5 text-red-600" />
              Delete
            </label>
          </div>

          {!converting && (
            <p className={`mt-1 text-sm truncate ${nameClassFor(row.action)}`}>{row.name}</p>
          )}

          {converting && (
            <div className="mt-2 space-y-2">
              <input
                type="text"
                value={row.name}
                onChange={e => onUpdate(row.id, { name: e.target.value })}
                placeholder="Task name"
                aria-label="Task name"
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
              <textarea
                value={row.notes}
                onChange={e => onUpdate(row.id, { notes: e.target.value })}
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
                        onUpdate(row.id, {
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
                    <div className="w-48">
                      <ProjectCombobox
                        value={row.projectGid}
                        onChange={gid => onUpdate(row.id, { projectGid: gid })}
                        projects={rowProjects}
                        clearLabel="No project"
                        placeholder="No project"
                        ariaLabel="Project"
                        className="text-xs border border-gray-300 rounded px-1.5 py-1"
                      />
                    </div>
                  </label>
                )}
                {rowTypes.length > 0 && (
                  <label className="flex items-center gap-1 text-[11px] text-gray-500">
                    Type
                    <select
                      value={row.taskType}
                      onChange={e => onUpdate(row.id, { taskType: e.target.value })}
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
                    onChange={e => onUpdate(row.id, { dueOn: e.target.value })}
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
});

export function RemindersStep({
  rows,
  setRows,
  loading,
  error,
  progress,
  integrations,
  projects,
  typeFieldInfoByIntegration,
}: RemindersStepProps) {
  // A local state update only — writes to Asana/Google are batched at confirm
  // (applyReminderActions), never on a click here. Stable across renders so the
  // memoized rows don't re-render when a sibling row changes.
  const update = useCallback<UpdateFn>(
    (id, patch) => setRows(prev => (prev ? prev.map(r => (r.id === id ? { ...r, ...patch } : r)) : prev)),
    [setRows]
  );

  // Group projects/types by integration ONCE per props change, rather than
  // re-filtering the whole project list (~130) for every row on every render.
  const projectsByIntegration = useMemo(() => {
    const m = new Map<string, AsanaProject[]>();
    for (const p of projects) {
      const arr = m.get(p.integrationId);
      if (arr) arr.push(p);
      else m.set(p.integrationId, [p]);
    }
    return m;
  }, [projects]);

  const typesByIntegration = useMemo(() => {
    const m = new Map<string, string[]>();
    if (typeFieldInfoByIntegration) {
      for (const [id, info] of typeFieldInfoByIntegration) {
        m.set(id, Array.from(info.enumOptions.keys()).sort());
      }
    }
    return m;
  }, [typeFieldInfoByIntegration]);

  if (loading || rows === null) {
    const done = progress?.done ?? 0;
    const total = progress?.total ?? 0;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return (
      <div className="py-8 text-center text-sm text-gray-500">
        <p>Reviewing your reminders and suggesting where each could go…</p>
        {total > 0 && (
          <div className="mx-auto mt-4 max-w-xs">
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Reminder review progress"
            >
              <div
                className="h-full rounded-full bg-orange-500 transition-all duration-300 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-gray-400">
              {done} of {total} batches
            </p>
          </div>
        )}
      </div>
    );
  }

  const convertCount = rows.filter(r => r.action === 'convert').length;
  const doneCount = rows.filter(r => r.action === 'done').length;
  const deleteCount = rows.filter(r => r.action === 'delete').length;
  const summaryParts: string[] = [];
  if (convertCount > 0) {
    summaryParts.push(`${convertCount} will become Asana task${convertCount === 1 ? '' : 's'}`);
  }
  if (doneCount > 0) summaryParts.push(`${doneCount} marked done`);
  if (deleteCount > 0) summaryParts.push(`${deleteCount} deleted`);

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Tidy up your reminders before planning. For each, keep it as a quick reminder, convert it into
        an Asana task (with an AI-suggested workspace, project and type you can adjust), mark it done,
        or delete it. Changes are applied when you add the plan to your calendar.
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

      {rows.map(row => (
        <ReminderRow
          key={row.id}
          row={row}
          rowProjects={projectsByIntegration.get(row.integrationId) ?? EMPTY_PROJECTS}
          rowTypes={typesByIntegration.get(row.integrationId) ?? EMPTY_TYPES}
          integrations={integrations}
          onUpdate={update}
        />
      ))}

      <p className="text-xs text-gray-400">
        {summaryParts.length > 0
          ? `${summaryParts.join('; ')}; the rest stay as reminders.`
          : 'Nothing selected to change — press Next (or Skip) to leave your reminders untouched.'}
      </p>
    </div>
  );
}
