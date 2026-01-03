'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdHocTask } from '@/types';
import {
  getAdHocTasks,
  addAdHocTask,
  updateAdHocTask,
  deleteAdHocTask,
} from '@/lib/storage';

export function useTasks() {
  const [tasks, setTasks] = useState<AdHocTask[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setTasks(getAdHocTasks());
    setIsLoaded(true);
  }, []);

  const addTask = useCallback((task: Omit<AdHocTask, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newTask = addAdHocTask(task);
    setTasks(prev => [...prev, newTask]);
    return newTask;
  }, []);

  const updateTask = useCallback((id: string, updates: Partial<AdHocTask>) => {
    const updated = updateAdHocTask(id, updates);
    if (updated) {
      setTasks(prev => prev.map(t => (t.id === id ? updated : t)));
    }
    return updated;
  }, []);

  const removeTask = useCallback((id: string) => {
    const success = deleteAdHocTask(id);
    if (success) {
      setTasks(prev => prev.filter(t => t.id !== id));
    }
    return success;
  }, []);

  const toggleComplete = useCallback((id: string) => {
    const task = tasks.find(t => t.id === id);
    if (task) {
      return updateTask(id, { completed: !task.completed });
    }
    return null;
  }, [tasks, updateTask]);

  const getTasksForDate = useCallback((date: string) => {
    return tasks.filter(task => task.dueDate === date);
  }, [tasks]);

  return {
    tasks,
    isLoaded,
    addTask,
    updateTask,
    removeTask,
    toggleComplete,
    getTasksForDate,
  };
}
