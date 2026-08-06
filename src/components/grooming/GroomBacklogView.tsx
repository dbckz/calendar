'use client';

import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { CalendarEventResponse } from '@/types';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { typeChoicesFor } from '@/lib/type-choices';
import { TypeFieldInfo, currentTypeOptionGid } from './helpers';

interface GroomBacklogViewProps {
  // The backlog snapshot (incomplete, not yet groomed), oldest createdAt first.
  backlog: CalendarEventResponse[];
  typeFieldInfoByIntegration: Map<string, TypeFieldInfo>;
  // Called once a task leaves the backlog so the parent can update master state.
  onGroomed: (gid: string) => void;
  onDeleted: (gid: string) => void;
}

interface Draft {
  title: string;
  notes: string;
  dueOn: string;
  typeGid: string; // Asana enum option gid (asana-writable workspaces)
  localType: string; // Type label (local-only workspaces, e.g. DBC)
}

// The task's current Type label, read from the (possibly overlaid) Type field.
// For a local-only workspace this is the local store's label.
function currentTypeLabel(task: CalendarEventResponse): string {
  return task.customFields?.find(cf => cf.name.toLowerCase() === 'type')?.displayValue ?? '';
}

const GUIDANCE = [
  'Is this still worth doing? If not, delete it.',
  'Could an AI agent do it, or a first pass of it? Delegate it.',
  'Make the next action concrete — rewrite the title/notes so future Dave knows exactly what "done" means.',
  'Set a realistic due date.',
  'Set the Type field.',
];

export function GroomBacklogView({
  backlog,
  typeFieldInfoByIntegration,
  onGroomed,
  onDeleted,
}: GroomBacklogViewProps) {
  const toast = useToast();

  // Session queue of gids. Snapshotted once from the initial backlog (oldest
  // first); skipped tasks go to the back, groomed/deleted ones are removed.
  const taskById = useMemo(() => {
    const m = new Map<string, CalendarEventResponse>();
    for (const t of backlog) m.set(t.id, t);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [queue, setQueue] = useState<string[]>(() => backlog.map(t => t.id));
  const [groomedCount, setGroomedCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showDelegate, setShowDelegate] = useState(false);
  const [brief, setBrief] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const currentGid = queue[0];
  const current = currentGid ? taskById.get(currentGid) : undefined;
  const typeInfo = current ? typeFieldInfoByIntegration.get(current.integrationId) : undefined;
  // One rule for the labels offered and where a chosen one is written. A local
  // workspace (no writable Asana Type field, e.g. DBC) offers the local union
  // labels and its Type is saved to the app-local store.
  const typeChoices = typeChoicesFor(current?.integrationId, typeFieldInfoByIntegration);
  // Both write targets render the same Type select; only what an option carries
  // differs — an Asana enum option gid, or the label itself for a local workspace.
  const isLocalType = typeChoices.writeTarget === 'local';
  const typeOptions = isLocalType
    ? typeChoices.labels.map(label => ({ value: label, label }))
    : (typeInfo?.options ?? []).map(o => ({ value: o.gid, label: o.label }));

  // Reset the edit draft whenever the current task changes.
  const [draft, setDraft] = useState<Draft>({ title: '', notes: '', dueOn: '', typeGid: '', localType: '' });
  useEffect(() => {
    if (!current) return;
    setDraft({
      title: current.title ?? '',
      notes: current.description ?? '',
      dueOn: current.dueOn ?? '',
      typeGid: currentTypeOptionGid(current) ?? '',
      localType: currentTypeLabel(current),
    });
    setShowDelegate(false);
    setBrief('');
    setConfirmDelete(false);
  }, [current]);

  // Build the field updates that differ from the task's current Asana values.
  const buildTaskUpdates = (task: CalendarEventResponse) => {
    const updates: {
      name?: string;
      notes?: string;
      dueOn?: string | null;
      customFields?: Record<string, string | null>;
    } = {};
    if (draft.title.trim() && draft.title !== task.title) updates.name = draft.title.trim();
    if (draft.notes !== (task.description ?? '')) updates.notes = draft.notes;
    if (draft.dueOn !== (task.dueOn ?? '')) updates.dueOn = draft.dueOn || null;
    // Only an Asana-writable workspace writes the Type as a custom field; a
    // local-only one is handled by groomCurrent via the app-local store.
    if (!isLocalType && typeInfo && draft.typeGid !== (currentTypeOptionGid(task) ?? '')) {
      updates.customFields = { [typeInfo.fieldGid]: draft.typeGid || null };
    }
    return updates;
  };

  const advance = (gid: string, remove: boolean) => {
    setQueue(prev => {
      const rest = prev.filter(g => g !== gid);
      return remove ? rest : [...rest, gid];
    });
  };

  // Save any edits, then mark groomed and advance. Shared by Groom and Delegate.
  const groomCurrent = async (task: CalendarEventResponse) => {
    const updates = buildTaskUpdates(task);
    if (Object.keys(updates).length > 0) {
      await api.updateAsanaTask(task.id, task.integrationId, updates);
    }
    // Local-only workspace: save the chosen Type label to the app-local store
    // ('' clears it — null deletes). Asana workspaces are handled above.
    if (isLocalType && draft.localType !== currentTypeLabel(task)) {
      await api.setLocalTaskTypes({ [task.id]: draft.localType || null });
    }
    await api.upsertTaskMetadata(task.id, task.integrationId, {
      groomed: true,
      groomedAt: new Date().toISOString(),
    });
  };

  const handleMarkGroomed = async () => {
    if (!current) return;
    setBusy(true);
    try {
      await groomCurrent(current);
      setGroomedCount(c => c + 1);
      onGroomed(current.id);
      advance(current.id, true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark groomed');
    } finally {
      setBusy(false);
    }
  };

  const handleDelegate = async () => {
    if (!current) return;
    if (!brief.trim()) {
      toast.error('Add a brief for the agent first.');
      return;
    }
    setBusy(true);
    try {
      await api.upsertDelegationEntry(current.id, current.integrationId, {
        title: draft.title.trim() || current.title,
        brief: brief.trim(),
        mode: 'background',
        state: 'queued',
      });
      await groomCurrent(current);
      setGroomedCount(c => c + 1);
      onGroomed(current.id);
      toast.success('Delegated to the agent queue');
      advance(current.id, true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delegate');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!current) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    try {
      await api.deleteAsanaTask(current.id, current.integrationId);
      onDeleted(current.id);
      toast.success('Task deleted');
      advance(current.id, true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete task');
    } finally {
      setBusy(false);
    }
  };

  const handleSkip = () => {
    if (!current) return;
    advance(current.id, false);
  };

  // Done state: nothing left in the queue.
  if (!current) {
    return (
      <div className="p-8 text-center">
        <p className="text-4xl mb-3">🎉</p>
        <p className="text-gray-800 font-medium">Backlog groomed.</p>
        <p className="text-sm text-gray-500 mt-1">
          {groomedCount > 0
            ? `${groomedCount} task${groomedCount === 1 ? '' : 's'} groomed this session.`
            : 'Nothing in the backlog right now.'}
        </p>
      </div>
    );
  }

  const inputClass =
    'w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none';

  return (
    <div className="p-4 space-y-4">
      <p className="text-sm text-gray-600">
        {queue.length} task{queue.length === 1 ? '' : 's'} in backlog · {groomedCount} groomed this session
      </p>

      <ul className="list-disc list-inside space-y-1 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3">
        {GUIDANCE.map(g => (
          <li key={g}>{g}</li>
        ))}
      </ul>

      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            {current.integrationName}
          </span>
          <span className="text-xs text-gray-400">
            {current.createdAt ? `created ${format(parseISO(current.createdAt), 'd MMM yyyy')}` : 'no created date'}
            {current.dueOn ? ` · due ${format(parseISO(current.dueOn), 'd MMM yyyy')}` : ' · no due date'}
          </span>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Title</label>
          <input
            className={inputClass}
            value={draft.title}
            onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notes</label>
          <textarea
            className={`${inputClass} min-h-[96px] resize-y`}
            value={draft.notes}
            onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Due date</label>
            <input
              type="date"
              className={inputClass}
              value={draft.dueOn}
              onChange={e => setDraft(d => ({ ...d, dueOn: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Type</label>
            <select
              className={`${inputClass} bg-white disabled:bg-gray-100`}
              value={isLocalType ? draft.localType : draft.typeGid}
              disabled={typeOptions.length === 0}
              onChange={e =>
                setDraft(d =>
                  isLocalType
                    ? { ...d, localType: e.target.value }
                    : { ...d, typeGid: e.target.value }
                )
              }
            >
              <option value="">—</option>
              {typeOptions.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {showDelegate && (
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Brief for the agent</label>
            <textarea
              className={`${inputClass} min-h-[72px] resize-y`}
              placeholder="Plain-English instruction for what the agent should do…"
              value={brief}
              onChange={e => setBrief(e.target.value)}
              autoFocus
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {!showDelegate ? (
          <button
            onClick={handleMarkGroomed}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50"
          >
            Mark groomed
          </button>
        ) : (
          <button
            onClick={handleDelegate}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50"
          >
            Confirm delegate
          </button>
        )}

        <button
          onClick={() => setShowDelegate(s => !s)}
          disabled={busy}
          className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50"
        >
          {showDelegate ? 'Cancel delegate' : 'Delegate'}
        </button>

        <button
          onClick={handleDelete}
          disabled={busy}
          className={`px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50 ${
            confirmDelete
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {confirmDelete ? 'Confirm delete' : 'Delete'}
        </button>

        <button
          onClick={handleSkip}
          disabled={busy}
          className="px-4 py-2 text-sm font-medium bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50 ml-auto"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
