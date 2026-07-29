/**
 * @jest-environment jsdom
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { useReminders } from '@/hooks/useReminders';
import { api } from '@/lib/api';
import { Reminder } from '@/types';

jest.mock('@/lib/api', () => ({
  api: {
    getReminders: jest.fn(),
    updateReminder: jest.fn(),
  },
}));

const toastMock = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/hooks/useToast', () => ({
  useToast: () => toastMock,
}));

const mockApi = api as jest.Mocked<typeof api>;

const reminder: Reminder = {
  id: 'reminder-1',
  text: 'Buy milk',
  completed: false,
  createdAt: '2024-01-01T00:00:00.000Z',
};

describe('useReminders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.getReminders.mockResolvedValue({ reminders: [reminder] });
    mockApi.updateReminder.mockResolvedValue({ reminder: { ...reminder, completed: true } });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('loads reminders on mount', async () => {
    const { result } = renderHook(() => useReminders());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.reminders).toEqual([reminder]);
  });

  it('completes a reminder optimistically and opens the undo window', async () => {
    const { result } = renderHook(() => useReminders());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.completeReminder(reminder);
    });

    expect(result.current.reminders[0].completed).toBe(true);
    expect(mockApi.updateReminder).toHaveBeenCalledWith('reminder-1', { completed: true });
    expect(result.current.undoState).toMatchObject({ id: 'reminder-1', previousCompleted: false });
  });

  it('undo restores the previous state', async () => {
    const { result } = renderHook(() => useReminders());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.completeReminder(reminder);
    });
    await act(async () => {
      await result.current.undo();
    });

    expect(result.current.reminders[0].completed).toBe(false);
    expect(result.current.undoState).toBeNull();
    expect(mockApi.updateReminder).toHaveBeenLastCalledWith('reminder-1', { completed: false });
  });

  it('rolls back the optimistic update when the API call fails', async () => {
    mockApi.updateReminder.mockRejectedValueOnce(new Error('boom'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const { result } = renderHook(() => useReminders());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.completeReminder(reminder);
    });

    expect(result.current.reminders[0].completed).toBe(false);
    expect(result.current.undoState).toBeNull();
    expect(toastMock.error).toHaveBeenCalledWith('Failed to complete reminder');
    consoleSpy.mockRestore();
  });

  it('expires the undo window after 10 seconds', async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useReminders());
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.completeReminder(reminder);
    });
    expect(result.current.undoState).not.toBeNull();

    act(() => {
      jest.advanceTimersByTime(10000);
    });

    expect(result.current.undoState).toBeNull();
  });
});
