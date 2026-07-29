'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { Reminder } from '@/types';

const UNDO_WINDOW_MS = 10000;

interface UndoReminderState {
  id: string;
  text: string;
  previousCompleted: boolean;
  nextCompleted: boolean;
}

interface UseRemindersReturn {
  reminders: Reminder[];
  isLoading: boolean;
  error: string | null;
  updatingIds: Set<string>;
  undoState: UndoReminderState | null;
  refetch: () => Promise<void>;
  completeReminder: (reminder: Reminder) => Promise<void>;
  undo: () => Promise<void>;
}

// Reminders list with optimistic completion, a 10-second undo window (surfaced
// via `undoState` and Cmd/Ctrl+Z), and rollback when the API call fails.
export function useReminders(): UseRemindersReturn {
  const toast = useToast();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(() => new Set());
  const [undoState, setUndoState] = useState<UndoReminderState | null>(null);
  const undoTimeoutRef = useRef<number | null>(null);

  const refetch = useCallback(async () => {
    try {
      setError(null);
      const data = await api.getReminders();
      setReminders(data.reminders);
    } catch (err) {
      console.error('Failed to load reminders:', err);
      setError('Unable to load reminders');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

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
    }, UNDO_WINDOW_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) {
        window.clearTimeout(undoTimeoutRef.current);
      }
    };
  }, []);

  const undo = useCallback(async () => {
    if (!undoState) return;

    const state = undoState;
    clearUndoState();
    setReminders(prev => prev.map(reminder => (
      reminder.id === state.id
        ? { ...reminder, completed: state.previousCompleted }
        : reminder
    )));
    setUpdatingIds(prev => {
      const next = new Set(prev);
      next.add(state.id);
      return next;
    });

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
    } finally {
      setUpdatingIds(prev => {
        const next = new Set(prev);
        next.delete(state.id);
        return next;
      });
    }
  }, [clearUndoState, toast, undoState]);

  const completeReminder = useCallback(async (reminder: Reminder) => {
    queueUndoState(reminder, true);
    setUpdatingIds(prev => {
      const next = new Set(prev);
      next.add(reminder.id);
      return next;
    });
    setReminders(prev => prev.map(item => item.id === reminder.id ? { ...item, completed: true } : item));
    toast.info('Reminder completed. Press Cmd/Ctrl+Z to undo.');

    try {
      await api.updateReminder(reminder.id, { completed: true });
    } catch (err) {
      console.error('Failed to complete reminder:', err);
      clearUndoState();
      setReminders(prev => prev.map(item => item.id === reminder.id ? reminder : item));
      toast.error('Failed to complete reminder');
    } finally {
      setUpdatingIds(prev => {
        const next = new Set(prev);
        next.delete(reminder.id);
        return next;
      });
    }
  }, [clearUndoState, queueUndoState, toast]);

  // Cmd/Ctrl+Z undoes the last completion while the undo window is open, except
  // when typing into a form control.
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
      void undo();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [undo, undoState]);

  return { reminders, isLoading, error, updatingIds, undoState, refetch, completeReminder, undo };
}
