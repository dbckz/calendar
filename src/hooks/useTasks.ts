'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdHocTask } from '@/types';
import { api } from '@/lib/api';

export function useTasks() {
  const [tasks, setTasks] = useState<AdHocTask[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    api.getAdHocTasks()
      .then(({ tasks }) => {
        setTasks(tasks);
        setIsLoaded(true);
      })
      .catch(error => {
        console.error('Failed to load tasks:', error);
        setIsLoaded(true);
      });
  }, []);

  const addTask = useCallback(async (task: Omit<AdHocTask, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const { task: newTask } = await api.addAdHocTask(task);
      setTasks(prev => [...prev, newTask]);
      return newTask;
    } catch (error) {
      console.error('Failed to add task:', error);
      return null;
    }
  }, []);

  const updateTask = useCallback(async (id: string, updates: Partial<AdHocTask>) => {
    try {
      const { task: updated } = await api.updateAdHocTask(id, updates);
      setTasks(prev => prev.map(t => (t.id === id ? updated : t)));
      return updated;
    } catch (error) {
      console.error('Failed to update task:', error);
      return null;
    }
  }, []);

  const removeTask = useCallback(async (id: string) => {
    try {
      await api.deleteAdHocTask(id);
      setTasks(prev => prev.filter(t => t.id !== id));
      return true;
    } catch (error) {
      console.error('Failed to remove task:', error);
      return false;
    }
  }, []);

  const toggleComplete = useCallback(async (id: string) => {
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
