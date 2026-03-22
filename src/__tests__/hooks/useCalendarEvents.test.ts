/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';

// Mock the dependent hooks
jest.mock('@/hooks/useGoogleCalendar', () => ({
  useGoogleCalendar: jest.fn(() => ({
    googleEvents: [],
    isLoading: false,
    error: null,
    fetchGoogleEventsForDates: jest.fn().mockResolvedValue(undefined),
    resetFetchedDates: jest.fn(),
    updateGoogleEvent: jest.fn().mockResolvedValue({ success: true }),
    createGoogleEvent: jest.fn().mockResolvedValue({ event: null }),
    deleteGoogleEvent: jest.fn().mockResolvedValue({ success: true }),
  })),
}));

jest.mock('@/hooks/useAsanaTasks', () => ({
  useAsanaTasks: jest.fn(() => ({
    allAsanaTasks: [],
    filteredAsanaTasks: [],
    scheduledAsanaTasks: [],
    isLoading: false,
    error: null,
    projects: [],
    typeValues: [],
    integrations: [],
    filters: {},
    filtersMap: {},
    setFilters: jest.fn(),
    getFiltersForIntegration: jest.fn().mockReturnValue({}),
    clearFilters: jest.fn(),
    typeFieldInfoByIntegration: {},
    fetchAllAsanaTasks: jest.fn().mockResolvedValue(undefined),
    scheduleAsana: jest.fn(),
    updateScheduledAsana: jest.fn(),
    updateScheduledAsanaByGoogleEvent: jest.fn(),
    unscheduleAsana: jest.fn(),
    unscheduleAllAsanaInstances: jest.fn(),
    getScheduledAsanaEventsForDate: jest.fn().mockReturnValue([]),
    completeAsanaTask: jest.fn(),
    addAsanaComment: jest.fn(),
    createAsanaTask: jest.fn(),
    updateAsanaTask: jest.fn(),
    deleteAsanaTask: jest.fn(),
  })),
}));

describe('useCalendarEvents hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('returns initial state with empty arrays', () => {
      const { result } = renderHook(() => useCalendarEvents());

      expect(result.current.googleEvents).toEqual([]);
      expect(result.current.allAsanaTasks).toEqual([]);
      expect(result.current.filteredAsanaTasks).toEqual([]);
      expect(result.current.scheduledAsanaTasks).toEqual([]);
    });

    it('returns loading state as false initially when hooks return false', () => {
      const { result } = renderHook(() => useCalendarEvents());
      expect(result.current.isLoading).toBe(false);
    });

    it('returns null error initially', () => {
      const { result } = renderHook(() => useCalendarEvents());
      expect(result.current.error).toBeNull();
    });
  });

  describe('adhocToCalendarEvent', () => {
    it('converts ad-hoc task with date and time to calendar event', () => {
      const { result } = renderHook(() => useCalendarEvents());

      const task = {
        id: 'task-1',
        title: 'Test Task',
        description: 'Test description',
        dueDate: '2024-01-15',
        dueTime: '14:30',
        duration: 60,
        completed: false,
        priority: 'high' as const,
        taskType: 'focus' as const,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const event = result.current.adhocToCalendarEvent(task);

      expect(event.id).toBe('task-1');
      expect(event.title).toBe('Test Task');
      expect(event.description).toBe('Test description');
      expect(event.source).toBe('adhoc');
      expect(event.completed).toBe(false);
      expect(event.startTime.getHours()).toBe(14);
      expect(event.startTime.getMinutes()).toBe(30);
      // 60 minute duration
      expect(event.endTime.getTime() - event.startTime.getTime()).toBe(60 * 60 * 1000);
    });

    it('uses default time (9 AM) when dueTime is not specified', () => {
      const { result } = renderHook(() => useCalendarEvents());

      const task = {
        id: 'task-1',
        title: 'Test Task',
        dueDate: '2024-01-15',
        completed: false,
        priority: 'medium' as const,
        taskType: 'focus' as const,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const event = result.current.adhocToCalendarEvent(task);

      expect(event.startTime.getHours()).toBe(9);
      expect(event.startTime.getMinutes()).toBe(0);
    });

    it('uses default duration (30 min) when not specified', () => {
      const { result } = renderHook(() => useCalendarEvents());

      const task = {
        id: 'task-1',
        title: 'Test Task',
        dueDate: '2024-01-15',
        dueTime: '10:00',
        completed: false,
        priority: 'medium' as const,
        taskType: 'focus' as const,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const event = result.current.adhocToCalendarEvent(task);

      // 30 minute default duration
      expect(event.endTime.getTime() - event.startTime.getTime()).toBe(30 * 60 * 1000);
    });

    it('assigns correct color based on priority', () => {
      const { result } = renderHook(() => useCalendarEvents());

      const lowTask = {
        id: '1',
        title: 'Low',
        dueDate: '2024-01-15',
        completed: false,
        priority: 'low' as const,
        taskType: 'focus' as const,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };
      const mediumTask = { ...lowTask, id: '2', priority: 'medium' as const };
      const highTask = { ...lowTask, id: '3', priority: 'high' as const };

      expect(result.current.adhocToCalendarEvent(lowTask).color).toBe('#22c55e'); // green
      expect(result.current.adhocToCalendarEvent(mediumTask).color).toBe('#eab308'); // yellow
      expect(result.current.adhocToCalendarEvent(highTask).color).toBe('#ef4444'); // red
    });

    it('handles task without dueDate', () => {
      const { result } = renderHook(() => useCalendarEvents());

      const task = {
        id: 'task-1',
        title: 'Test Task',
        completed: false,
        priority: 'medium' as const,
        taskType: 'focus' as const,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const event = result.current.adhocToCalendarEvent(task);

      // Should default to 9 AM today
      expect(event.startTime.getHours()).toBe(9);
      expect(event.startTime.getMinutes()).toBe(0);
    });
  });

  describe('exposed functions', () => {
    it('exposes fetchAllEvents function', () => {
      const { result } = renderHook(() => useCalendarEvents());
      expect(typeof result.current.fetchAllEvents).toBe('function');
    });

    it('exposes scheduleAsana function', () => {
      const { result } = renderHook(() => useCalendarEvents());
      expect(typeof result.current.scheduleAsana).toBe('function');
    });

    it('exposes updateGoogleEvent function', () => {
      const { result } = renderHook(() => useCalendarEvents());
      expect(typeof result.current.updateGoogleEvent).toBe('function');
    });

    it('exposes createGoogleEvent function', () => {
      const { result } = renderHook(() => useCalendarEvents());
      expect(typeof result.current.createGoogleEvent).toBe('function');
    });

    it('exposes deleteGoogleEvent function', () => {
      const { result } = renderHook(() => useCalendarEvents());
      expect(typeof result.current.deleteGoogleEvent).toBe('function');
    });

    it('exposes filter-related state and functions', () => {
      const { result } = renderHook(() => useCalendarEvents());

      expect(result.current.asanaProjects).toEqual([]);
      expect(result.current.asanaTypeValues).toEqual([]);
      expect(result.current.asanaIntegrations).toEqual([]);
      expect(result.current.asanaFilters).toEqual({});
      expect(typeof result.current.setAsanaFilters).toBe('function');
      expect(typeof result.current.clearAsanaFilters).toBe('function');
    });
  });
});
