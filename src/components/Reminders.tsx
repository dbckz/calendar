'use client';

import { useState, useEffect, useRef } from 'react';
import { Archive, Plus, Trash2 } from 'lucide-react';
import { Reminder } from '@/types';
import { api } from '@/lib/api';

export function Reminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [newText, setNewText] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getReminders()
      .then(data => setReminders(data.reminders))
      .catch(err => console.error('Failed to load reminders:', err));
  }, []);

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
    setReminders(prev => prev.map(r => r.id === id ? { ...r, completed } : r));
    try {
      await api.updateReminder(id, { completed });
    } catch (err) {
      console.error('Failed to update reminder:', err);
      setReminders(prev => prev.map(r => r.id === id ? { ...r, completed: !completed } : r));
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

  const uncompleted = reminders.filter(r => !r.completed);
  const completed = reminders.filter(r => r.completed);

  return (
    <div className="bg-white rounded-lg border shadow-sm p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">Reminders</h2>
        <div className="flex items-center gap-1">
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
        </div>
      </div>

      {isAdding && (
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

      {reminders.length === 0 && !isAdding && (
        <p className="text-sm text-gray-400 italic">No reminders</p>
      )}

      <ul className="space-y-1">
        {uncompleted.map(r => (
          <ReminderItem key={r.id} reminder={r} onToggle={handleToggle} onDelete={handleDelete} />
        ))}
        {completed.map(r => (
          <ReminderItem key={r.id} reminder={r} onToggle={handleToggle} onDelete={handleDelete} />
        ))}
      </ul>
    </div>
  );
}

function ReminderItem({
  reminder,
  onToggle,
  onDelete,
}: {
  reminder: Reminder;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <li className="group flex items-center gap-2 py-1 px-1 rounded hover:bg-gray-50 transition-colors">
      <input
        type="checkbox"
        checked={reminder.completed}
        onChange={() => onToggle(reminder.id, !reminder.completed)}
        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
      />
      <span className={`flex-1 text-sm ${reminder.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
        {reminder.text}
      </span>
      <button
        onClick={() => onDelete(reminder.id)}
        className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
        title="Delete"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}
