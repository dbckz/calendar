import {
  getAsanaAuthUrl,
  asanaTaskToCalendarEvent,
  getAsanaTaskUrl,
} from '@/lib/asana';
import { AsanaTask } from '@/types';

describe('Asana Utilities', () => {
  describe('getAsanaAuthUrl', () => {
    it('generates correct OAuth URL with required params', () => {
      const url = getAsanaAuthUrl('client-123', 'http://localhost:3001/callback');

      expect(url).toContain('https://app.asana.com/-/oauth_authorize');
      expect(url).toContain('client_id=client-123');
      expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3001%2Fcallback');
      expect(url).toContain('response_type=code');
      expect(url).toContain('scope=');
    });

    it('includes state parameter when provided', () => {
      const url = getAsanaAuthUrl('client-123', 'http://localhost:3001/callback', 'my-state');

      expect(url).toContain('state=my-state');
    });

    it('does not include state parameter when not provided', () => {
      const url = getAsanaAuthUrl('client-123', 'http://localhost:3001/callback');

      expect(url).not.toContain('state=');
    });

    it('includes required scopes', () => {
      const url = getAsanaAuthUrl('client-123', 'http://localhost:3001/callback');

      // Check that the URL includes required scopes
      expect(url).toContain('workspaces%3Aread');
      expect(url).toContain('tasks%3Aread');
    });
  });

  describe('asanaTaskToCalendarEvent', () => {
    it('converts task with dueAt to calendar event', () => {
      const task: AsanaTask = {
        id: 'task-1',
        gid: 'task-1',
        name: 'Test Task',
        notes: 'Task notes',
        dueAt: '2024-01-15T14:00:00.000Z',
        completed: false,
      };

      const event = asanaTaskToCalendarEvent(task);

      expect(event.id).toBe('task-1');
      expect(event.title).toBe('Test Task');
      expect(event.description).toBe('Task notes');
      expect(event.source).toBe('asana');
      expect(event.color).toBe('#f06a6a');
      expect(event.completed).toBe(false);
      expect(event.startTime).toEqual(new Date('2024-01-15T14:00:00.000Z'));
      // End time should be 30 minutes after start
      expect(event.endTime.getTime() - event.startTime.getTime()).toBe(30 * 60 * 1000);
    });

    it('converts task with dueOn (date only) to calendar event', () => {
      const task: AsanaTask = {
        id: 'task-2',
        gid: 'task-2',
        name: 'Date-only Task',
        dueOn: '2024-01-15',
        completed: false,
      };

      const event = asanaTaskToCalendarEvent(task);

      expect(event.startTime.getHours()).toBe(9); // Default 9 AM
      expect(event.startTime.getMinutes()).toBe(0);
      expect(event.dueOn).toBe('2024-01-15');
    });

    it('converts task without due date to calendar event with default time', () => {
      const task: AsanaTask = {
        id: 'task-3',
        gid: 'task-3',
        name: 'No Due Date Task',
        completed: false,
      };

      const event = asanaTaskToCalendarEvent(task);

      expect(event.startTime.getHours()).toBe(9);
      expect(event.startTime.getMinutes()).toBe(0);
    });

    it('includes assignee name when available', () => {
      const task: AsanaTask = {
        id: 'task-4',
        gid: 'task-4',
        name: 'Assigned Task',
        completed: false,
        assignee: {
          gid: 'user-1',
          name: 'John Doe',
        },
      };

      const event = asanaTaskToCalendarEvent(task);

      expect(event.assignee).toBe('John Doe');
    });

    it('handles missing optional fields', () => {
      const task: AsanaTask = {
        id: 'task-5',
        gid: 'task-5',
        name: 'Minimal Task',
        completed: true,
      };

      const event = asanaTaskToCalendarEvent(task);

      expect(event.description).toBeUndefined();
      expect(event.assignee).toBeUndefined();
      expect(event.dueOn).toBeUndefined();
      expect(event.completed).toBe(true);
    });

    it('sets default duration to 30 minutes', () => {
      const task: AsanaTask = {
        id: 'task-6',
        gid: 'task-6',
        name: 'Duration Test',
        dueAt: '2024-01-15T10:00:00.000Z',
        completed: false,
      };

      const event = asanaTaskToCalendarEvent(task);

      const durationMs = event.endTime.getTime() - event.startTime.getTime();
      expect(durationMs).toBe(30 * 60 * 1000); // 30 minutes in milliseconds
    });
  });

  describe('getAsanaTaskUrl', () => {
    it('generates correct URL format', () => {
      const url = getAsanaTaskUrl('1234567890');

      expect(url).toBe('https://app.asana.com/0/0/1234567890');
    });

    it('handles various task IDs', () => {
      expect(getAsanaTaskUrl('abc123')).toBe('https://app.asana.com/0/0/abc123');
      expect(getAsanaTaskUrl('12345')).toBe('https://app.asana.com/0/0/12345');
    });
  });
});

// API function tests (with mocked fetch)
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Asana API Functions', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('getAsanaTokensFromCode', () => {
    it('exchanges auth code for tokens', async () => {
      // Import here to use mocked fetch
      const { getAsanaTokensFromCode } = await import('@/lib/asana');

      const mockTokenResponse = {
        access_token: 'access-123',
        refresh_token: 'refresh-456',
        expires_in: 3600,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTokenResponse),
      });

      const beforeTime = Date.now();
      const tokens = await getAsanaTokensFromCode(
        'auth-code',
        'client-id',
        'client-secret',
        'http://localhost:3001/callback'
      );
      const afterTime = Date.now();

      expect(tokens.accessToken).toBe('access-123');
      expect(tokens.refreshToken).toBe('refresh-456');
      expect(tokens.expiresAt).toBeGreaterThanOrEqual(beforeTime + 3600 * 1000);
      expect(tokens.expiresAt).toBeLessThanOrEqual(afterTime + 3600 * 1000);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://app.asana.com/-/oauth_token',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('throws error on failed token exchange', async () => {
      const { getAsanaTokensFromCode } = await import('@/lib/asana');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Invalid code'),
      });

      await expect(
        getAsanaTokensFromCode('bad-code', 'client-id', 'client-secret', 'http://localhost')
      ).rejects.toThrow('Failed to get tokens');
    });
  });

  describe('completeTask', () => {
    it('updates task completion status', async () => {
      const { completeTask } = await import('@/lib/asana');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: {} }),
      });

      await completeTask('access-token', 'task-gid', true);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://app.asana.com/api/1.0/tasks/task-gid',
        expect.objectContaining({
          method: 'PUT',
          headers: {
            'Authorization': 'Bearer access-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            data: { completed: true },
          }),
        })
      );
    });

    it('throws error on failure', async () => {
      const { completeTask } = await import('@/lib/asana');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      });

      await expect(completeTask('token', 'bad-task', true)).rejects.toThrow(
        'Failed to update task'
      );
    });
  });

  describe('addTaskComment', () => {
    it('adds comment to task', async () => {
      const { addTaskComment } = await import('@/lib/asana');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: {} }),
      });

      await addTaskComment('access-token', 'task-gid', 'My comment');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://app.asana.com/api/1.0/tasks/task-gid/stories',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            data: { text: 'My comment' },
          }),
        })
      );
    });

    it('throws error on failure', async () => {
      const { addTaskComment } = await import('@/lib/asana');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad request'),
      });

      await expect(addTaskComment('token', 'task', 'comment')).rejects.toThrow(
        'Failed to add comment'
      );
    });
  });
});
