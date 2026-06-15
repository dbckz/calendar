'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Archive, ArrowRightToLine, ListChecks, Plus, Trash2 } from 'lucide-react';
import { AsanaProject, CalendarEvent, Reminder } from '@/types';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { AsanaTypeFieldInfo, CreateAsanaTaskModal, CreateAsanaTaskOptions } from './CreateAsanaTaskModal';

interface RemindersProps {
  asanaIntegrations?: { id: string; name: string }[];
  asanaProjects?: AsanaProject[];
  asanaTypeFieldInfoByIntegration?: Map<string, AsanaTypeFieldInfo>;
  onCreateAsanaTask?: (
    integrationId: string,
    name: string,
    options?: CreateAsanaTaskOptions,
  ) => Promise<CalendarEvent | null>;
}

export function Reminders({
  asanaIntegrations,
  asanaProjects,
  asanaTypeFieldInfoByIntegration,
  onCreateAsanaTask,
}: RemindersProps = {}) {
  const toast = useToast();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [newText, setNewText] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [conversionQueue, setConversionQueue] = useState<Reminder[]>([]);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [undoState, setUndoState] = useState<{
    id: string;
    text: string;
    previousCompleted: boolean;
    nextCompleted: boolean;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const conversionSucceededRef = useRef(false);
  const undoTimeoutRef = useRef<number | null>(null);

  const canConvertToAsana =
    !!onCreateAsanaTask && !!asanaIntegrations && asanaIntegrations.length > 0;

  const currentConversion = conversionQueue[0] ?? null;
  const isBulkConversion = bulkTotal > 1;
  const currentBulkIndex = bulkTotal - conversionQueue.length + 1;

  useEffect(() => {
    api.getReminders()
      .then(data => setReminders(data.reminders))
      .catch(err => console.error('Failed to load reminders:', err));
  }, []);

  const clearUndoState = useCallback(() => {
    if (undoTimeoutRef.current) {
      window.clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }
    setUndoState(null);
  }, []);

  const queueUndoState = useCallback((reminder: Reminder, nextCompleted: boolean) => {
    if (undoTimeoutRef.current) {
      window.clearTimeout(undoTimeoutRef.current);
    }

    setUndoState({
      id: reminder.id,
      text: reminder.text,
      previousCompleted: reminder.completed,
      nextCompleted,
    });

    undoTimeoutRef.current = window.setTimeout(() => {
      undoTimeoutRef.current = null;
      setUndoState(null);
    }, 10000);
  }, []);

  const handleUndo = useCallback(async () => {
    if (!undoState) return;

    const state = undoState;
    clearUndoState();
    setReminders(prev => prev.map(reminder => (
      reminder.id === state.id
        ? { ...reminder, completed: state.previousCompleted }
        : reminder
    )));

    try {
      await api.updateReminder(state.id, { completed: state.previousCompleted });
      toast.success(`Reinstated "${state.text}"`);
    } catch (err) {
      console.error('Failed to undo reminder change:', err);
      setReminders(prev => prev.map(reminder => (
        reminder.id === state.id
          ? { ...reminder, completed: state.nextCompleted }
          : reminder
      )));
      toast.error('Failed to undo reminder change');
    }
  }, [clearUndoState, toast, undoState]);

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) {
        window.clearTimeout(undoTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!undoState) return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== 'z') return;

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }

      event.preventDefault();
      void handleUndo();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, undoState]);

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = async () => {
    const text = newText.trim();
    if (!text) return;
    setNewText('');
    try {
      const { reminder } = await api.addReminder(text);
      setReminders(prev => [...prev, reminder]);
    } catch (err) {
      console.error('Failed to add reminder:', err);
    }
  };

  const handleToggle = async (id: string, completed: boolean) => {
    const reminder = reminders.find(item => item.id === id);
    if (!reminder) return;

    queueUndoState(reminder, completed);
    setReminders(prev => prev.map(r => r.id === id ? { ...r, completed } : r));
    toast.info(`Reminder updated. Press Cmd/Ctrl+Z to undo.`);
    try {
      await api.updateReminder(id, { completed });
    } catch (err) {
      console.error('Failed to update reminder:', err);
      setReminders(prev => prev.map(r => r.id === id ? { ...r, completed: !completed } : r));
      clearUndoState();
      toast.error('Failed to update reminder');
    }
  };

  const handleDelete = async (id: string) => {
    const prev = reminders;
    setReminders(r => r.filter(item => item.id !== id));
    try {
      await api.deleteReminder(id);
    } catch (err) {
      console.error('Failed to delete reminder:', err);
      setReminders(prev);
    }
  };

  const handleArchive = async () => {
    setIsArchiving(true);
    try {
      await api.archiveReminders();
      setReminders(prev => prev.filter(r => !r.completed));
    } catch (err) {
      console.error('Failed to archive reminders:', err);
    } finally {
      setIsArchiving(false);
    }
  };

  const startSingleConversion = (reminder: Reminder) => {
    setBulkTotal(1);
    setConversionQueue([reminder]);
  };

  const startBulkConversion = () => {
    const queue = reminders.filter(r => selectedIds.has(r.id) && !r.completed);
    if (queue.length === 0) return;
    setBulkTotal(queue.length);
    setConversionQueue(queue);
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    const idsToDelete = Array.from(selectedIds);
    if (idsToDelete.length === 0) return;
    const previous = reminders;
    setReminders(prev => prev.filter(r => !selectedIds.has(r.id)));
    exitSelectMode();
    const results = await Promise.allSettled(
      idsToDelete.map(id => api.deleteReminder(id)),
    );
    const failedIds = idsToDelete.filter((_, i) => results[i].status === 'rejected');
    if (failedIds.length > 0) {
      const failedSet = new Set(failedIds);
      setReminders(prev => {
        const restored = previous.filter(r => failedSet.has(r.id));
        const remainingIds = new Set(prev.map(r => r.id));
        const toAdd = restored.filter(r => !remainingIds.has(r.id));
        return [...prev, ...toAdd];
      });
      toast.error(
        failedIds.length === idsToDelete.length
          ? `Failed to delete ${failedIds.length} reminder${failedIds.length === 1 ? '' : 's'}`
          : `Deleted ${idsToDelete.length - failedIds.length}; ${failedIds.length} failed`,
      );
    } else {
      toast.success(`Deleted ${idsToDelete.length} reminder${idsToDelete.length === 1 ? '' : 's'}`);
    }
  };

  const handleConversionCreate = async (
    integrationId: string,
    name: string,
    options?: CreateAsanaTaskOptions,
  ): Promise<CalendarEvent | null> => {
    conversionSucceededRef.current = false;
    if (!onCreateAsanaTask || !currentConversion) return null;
    const task = await onCreateAsanaTask(integrationId, name, options);
    if (task) {
      conversionSucceededRef.current = true;
      const reminderId = currentConversion.id;
      setReminders(prev => prev.filter(r => r.id !== reminderId));
      try {
        await api.deleteReminder(reminderId);
      } catch (err) {
        console.error('Failed to delete reminder after conversion:', err);
      }
    }
    return task;
  };

  const handleConversionClose = () => {
    if (conversionSucceededRef.current) {
      conversionSucceededRef.current = false;
      setConversionQueue(prev => {
        const next = prev.slice(1);
        if (next.length === 0) setBulkTotal(0);
        return next;
      });
    } else {
      setConversionQueue([]);
      setBulkTotal(0);
    }
  };

  const uncompleted = reminders.filter(r => !r.completed);
  const completed = reminders.filter(r => r.completed);

  return (
    <div className="bg-white rounded-lg border shadow-sm p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">Reminders</h2>
        <div className="flex items-center gap-1">
          {selectMode ? (
            <>
              <span className="text-xs text-gray-500 pr-1">
                {selectedIds.size} selected
              </span>
              <button
                onClick={startBulkConversion}
                disabled={selectedIds.size === 0}
                className="flex items-center gap-1 px-2 py-1 text-xs text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Convert selected reminders to Asana tasks"
              >
                <ArrowRightToLine className="w-3.5 h-3.5" />
                Convert
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={selectedIds.size === 0}
                className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Delete selected reminders"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
              <button
                onClick={exitSelectMode}
                className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              {canConvertToAsana && uncompleted.length > 0 && (
                <button
                  onClick={() => setSelectMode(true)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                  title="Select multiple reminders"
                >
                  <ListChecks className="w-3.5 h-3.5" />
                  Select
                </button>
              )}
              <button
                onClick={handleArchive}
                disabled={isArchiving}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                title="Archive completed reminders"
              >
                <Archive className="w-3.5 h-3.5" />
                {isArchiving ? 'Archiving...' : 'Archive'}
              </button>
              {!isAdding && (
                <button
                  onClick={() => {
                    setIsAdding(true);
                    setTimeout(() => inputRef.current?.focus(), 0);
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                  title="Add reminder"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {isAdding && !selectMode && (
        <form
          onSubmit={(e) => { e.preventDefault(); handleAdd(); }}
          className="flex gap-2 mb-3"
        >
          <input
            ref={inputRef}
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onBlur={() => { if (!newText.trim()) setIsAdding(false); }}
            onKeyDown={(e) => { if (e.key === 'Escape') { setNewText(''); setIsAdding(false); } }}
            placeholder="Add a reminder..."
            className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={!newText.trim()}
            className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Add
          </button>
        </form>
      )}

      {undoState && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          <span className="min-w-0 truncate">
            Reminder updated. Press Cmd/Ctrl+Z to undo.
          </span>
          <button
            type="button"
            onClick={() => void handleUndo()}
            className="flex-shrink-0 rounded px-2 py-1 font-medium text-blue-700 hover:bg-blue-100"
          >
            Undo
          </button>
        </div>
      )}

      {reminders.length === 0 && !isAdding && (
        <p className="text-sm text-gray-400 italic">No reminders</p>
      )}

      <ul className="space-y-1">
        {uncompleted.map(r => (
          <ReminderItem
            key={r.id}
            reminder={r}
            onToggle={handleToggle}
            onDelete={handleDelete}
            onConvert={canConvertToAsana ? () => startSingleConversion(r) : undefined}
            selectMode={selectMode}
            isSelected={selectedIds.has(r.id)}
            onToggleSelected={() => toggleSelected(r.id)}
          />
        ))}
        {completed.map(r => (
          <ReminderItem
            key={r.id}
            reminder={r}
            onToggle={handleToggle}
            onDelete={handleDelete}
            onConvert={canConvertToAsana ? () => startSingleConversion(r) : undefined}
            selectMode={selectMode}
            isSelected={selectedIds.has(r.id)}
            onToggleSelected={() => toggleSelected(r.id)}
          />
        ))}
      </ul>

      {currentConversion && canConvertToAsana && (
        <CreateAsanaTaskModal
          key={currentConversion.id}
          integrations={asanaIntegrations!}
          projects={asanaProjects ?? []}
          typeFieldInfoByIntegration={asanaTypeFieldInfoByIntegration}
          initialName={currentConversion.text}
          title={
            isBulkConversion
              ? `Convert reminder ${currentBulkIndex} of ${bulkTotal}`
              : 'Convert Reminder to Asana Task'
          }
          submitLabel={
            isBulkConversion && currentBulkIndex < bulkTotal
              ? 'Convert & Next'
              : 'Convert to Task'
          }
          onClose={handleConversionClose}
          onCreateTask={handleConversionCreate}
        />
      )}
    </div>
  );
}

function ReminderItem({
  reminder,
  onToggle,
  onDelete,
  onConvert,
  selectMode,
  isSelected,
  onToggleSelected,
}: {
  reminder: Reminder;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  onConvert?: () => void;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelected: () => void;
}) {
  const rowClickable = selectMode && !reminder.completed;
  return (
    <li
      className={`group flex items-center gap-2 py-1 px-1 rounded transition-colors ${
        rowClickable ? 'cursor-pointer hover:bg-orange-50' : 'hover:bg-gray-50'
      } ${selectMode && isSelected ? 'bg-orange-50' : ''}`}
      onClick={rowClickable ? onToggleSelected : undefined}
    >
      {selectMode ? (
        <input
          type="checkbox"
          checked={isSelected}
          disabled={reminder.completed}
          onChange={onToggleSelected}
          onClick={e => e.stopPropagation()}
          className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer disabled:opacity-40"
        />
      ) : (
        <input
          type="checkbox"
          checked={reminder.completed}
          onChange={() => onToggle(reminder.id, !reminder.completed)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
        />
      )}
      <span className={`flex-1 text-sm ${reminder.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
        {reminder.text}
      </span>
      {!selectMode && onConvert && !reminder.completed && (
        <button
          onClick={onConvert}
          className="p-1 text-gray-300 hover:text-orange-500 opacity-0 group-hover:opacity-100 transition-all"
          title="Convert to Asana task"
        >
          <ArrowRightToLine className="w-3.5 h-3.5" />
        </button>
      )}
      {!selectMode && (
        <button
          onClick={() => onDelete(reminder.id)}
          className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </li>
  );
}
