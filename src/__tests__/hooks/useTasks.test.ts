/**
 * @jest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { useTasks } from '@/hooks/useTasks';
import * as storage from '@/lib/storage';

// Mock the storage module
jest.mock('@/lib/storage', () => ({
  getAdHocTasks: jest.fn(),
  addAdHocTask: jest.fn(),
  updateAdHocTask: jest.fn(),
  deleteAdHocTask: jest.fn(),
}));

const mockStorage = storage as jest.Mocked<typeof storage>;

describe('useTasks hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.getAdHocTasks.mockReturnValue([]);
  });

  describe('initialization', () => {
    it('returns empty tasks array initially', () => {
      const { result } = renderHook(() => useTasks());
      expect(result.current.tasks).toEqual([]);
    });

    it('loads tasks from storage on mount', () => {
      const existingTasks = [
        { id: '1', title: 'Task 1', completed: false, priority: 'medium' as const, taskType: 'focus' as const, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
        { id: '2', title: 'Task 2', completed: true, priority: 'high' as const, taskType: 'email' as const, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
      ];
      mockStorage.getAdHocTasks.mockReturnValue(existingTasks);

      const { result } = renderHook(() => useTasks());

      expect(mockStorage.getAdHocTasks).toHaveBeenCalled();
      expect(result.current.tasks).toEqual(existingTasks);
    });

    it('sets isLoaded to true after loading', () => {
      const { result } = renderHook(() => useTasks());
      expect(result.current.isLoaded).toBe(true);
    });
  });

  describe('addTask', () => {
    it('adds a new task and updates state', () => {
      const newTask = {
        title: 'New Task',
        completed: false,
        priority: 'medium' as const,
        taskType: 'focus' as const,
      };
      const createdTask = {
        ...newTask,
        id: 'new-id',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };
      mockStorage.addAdHocTask.mockReturnValue(createdTask);

      const { result } = renderHook(() => useTasks());

      act(() => {
        const returned = result.current.addTask(newTask);
        expect(returned).toEqual(createdTask);
      });

      expect(mockStorage.addAdHocTask).toHaveBeenCalledWith(newTask);
      expect(result.current.tasks).toContainEqual(createdTask);
    });
  });

  describe('updateTask', () => {
    it('updates an existing task', () => {
      const existingTask = {
        id: '1',
        title: 'Task 1',
        completed: false,
        priority: 'medium' as const,
        taskType: 'focus' as const,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      const updatedTask = { ...existingTask, title: 'Updated Task' };

      mockStorage.getAdHocTasks.mockReturnValue([existingTask]);
      mockStorage.updateAdHocTask.mockReturnValue(updatedTask);

      const { result } = renderHook(() => useTasks());

      act(() => {
        const returned = result.current.updateTask('1', { title: 'Updated Task' });
        expect(returned).toEqual(updatedTask);
      });

      expect(result.current.tasks[0].title).toBe('Updated Task');
    });

    it('returns null for non-existent task', () => {
      mockStorage.updateAdHocTask.mockReturnValue(null);

      const { result } = renderHook(() => useTasks());

      act(() => {
        const returned = result.current.updateTask('non-existent', { title: 'Test' });
        expect(returned).toBeNull();
      });
    });
  });

  describe('removeTask', () => {
    it('removes a task successfully', () => {
      const existingTask = {
        id: '1',
        title: 'Task 1',
        completed: false,
        priority: 'medium' as const,
        taskType: 'focus' as const,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      mockStorage.getAdHocTasks.mockReturnValue([existingTask]);
      mockStorage.deleteAdHocTask.mockReturnValue(true);

      const { result } = renderHook(() => useTasks());

      act(() => {
        const success = result.current.removeTask('1');
        expect(success).toBe(true);
      });

      expect(result.current.tasks).toHaveLength(0);
    });

    it('returns false for non-existent task', () => {
      mockStorage.deleteAdHocTask.mockReturnValue(false);

      const { result } = renderHook(() => useTasks());

      act(() => {
        const success = result.current.removeTask('non-existent');
        expect(success).toBe(false);
      });
    });
  });

  describe('toggleComplete', () => {
    it('toggles task completion status', () => {
      const existingTask = {
        id: '1',
        title: 'Task 1',
        completed: false,
        priority: 'medium' as const,
        taskType: 'focus' as const,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      const toggledTask = { ...existingTask, completed: true };

      mockStorage.getAdHocTasks.mockReturnValue([existingTask]);
      mockStorage.updateAdHocTask.mockReturnValue(toggledTask);

      const { result } = renderHook(() => useTasks());

      act(() => {
        const returned = result.current.toggleComplete('1');
        expect(returned).toEqual(toggledTask);
      });

      expect(mockStorage.updateAdHocTask).toHaveBeenCalledWith('1', { completed: true });
    });

    it('returns null for non-existent task', () => {
      const { result } = renderHook(() => useTasks());

      act(() => {
        const returned = result.current.toggleComplete('non-existent');
        expect(returned).toBeNull();
      });
    });
  });

  describe('getTasksForDate', () => {
    it('filters tasks by date', () => {
      const tasks = [
        { id: '1', title: 'Task 1', dueDate: '2024-01-15', completed: false, priority: 'medium' as const, taskType: 'focus' as const, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
        { id: '2', title: 'Task 2', dueDate: '2024-01-16', completed: false, priority: 'high' as const, taskType: 'email' as const, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
        { id: '3', title: 'Task 3', dueDate: '2024-01-15', completed: false, priority: 'low' as const, taskType: 'writing' as const, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
      ];

      mockStorage.getAdHocTasks.mockReturnValue(tasks);

      const { result } = renderHook(() => useTasks());

      const tasksForDate = result.current.getTasksForDate('2024-01-15');
      expect(tasksForDate).toHaveLength(2);
      expect(tasksForDate.map(t => t.id)).toEqual(['1', '3']);
    });

    it('returns empty array when no tasks match date', () => {
      const tasks = [
        { id: '1', title: 'Task 1', dueDate: '2024-01-15', completed: false, priority: 'medium' as const, taskType: 'focus' as const, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
      ];

      mockStorage.getAdHocTasks.mockReturnValue(tasks);

      const { result } = renderHook(() => useTasks());

      const tasksForDate = result.current.getTasksForDate('2024-01-20');
      expect(tasksForDate).toHaveLength(0);
    });
  });
});
