import { resolveTaskOwner } from '@/lib/asana-orchestrator';
import { getEnabledAsanaIntegrations, updateIntegration } from '@/lib/integration-storage';
import { getTaskById, refreshAsanaToken } from '@/lib/asana';
import { AsanaIntegration } from '@/types';

jest.mock('@/lib/integration-storage', () => ({
  getEnabledAsanaIntegrations: jest.fn(),
  updateIntegration: jest.fn(),
}));

jest.mock('@/lib/asana', () => ({
  getTaskById: jest.fn(),
  refreshAsanaToken: jest.fn(),
}));

const mockGetIntegrations = getEnabledAsanaIntegrations as jest.Mock;
const mockUpdateIntegration = updateIntegration as jest.Mock;
const mockGetTaskById = getTaskById as jest.Mock;
const mockRefreshToken = refreshAsanaToken as jest.Mock;

function integration(overrides: Partial<AsanaIntegration> = {}): AsanaIntegration {
  return {
    id: overrides.id ?? 'int-1',
    name: overrides.name ?? 'DBC',
    type: 'asana',
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    clientId: 'client',
    clientSecret: 'secret',
    workspaceId: 'ws-1',
    credentials: overrides.credentials ?? {
      accessToken: 'token-1',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() + 3_600_000,
    },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resolveTaskOwner', () => {
  it('returns the first integration that can see the task', async () => {
    const int = integration();
    mockGetIntegrations.mockResolvedValue([int]);
    mockGetTaskById.mockResolvedValue({ gid: '123', name: 'Task A' });

    const resolved = await resolveTaskOwner('123');

    expect(resolved).not.toBeNull();
    expect(resolved!.integration.id).toBe('int-1');
    expect(resolved!.accessToken).toBe('token-1');
    expect(resolved!.task).toEqual({ gid: '123', name: 'Task A' });
    expect(mockGetTaskById).toHaveBeenCalledWith('token-1', '123');
  });

  it('probes the next integration when the first cannot access the task', async () => {
    const dbc = integration({ id: 'dbc', name: 'DBC', credentials: { accessToken: 'tok-dbc' } });
    const om = integration({ id: 'om', name: 'OM', credentials: { accessToken: 'tok-om' } });
    mockGetIntegrations.mockResolvedValue([dbc, om]);
    // First integration returns null (403/404), second finds it.
    mockGetTaskById.mockResolvedValueOnce(null).mockResolvedValueOnce({ gid: '9', name: 'OM task' });

    const resolved = await resolveTaskOwner('9');

    expect(resolved!.integration.id).toBe('om');
    expect(resolved!.accessToken).toBe('tok-om');
    expect(mockGetTaskById).toHaveBeenNthCalledWith(1, 'tok-dbc', '9');
    expect(mockGetTaskById).toHaveBeenNthCalledWith(2, 'tok-om', '9');
  });

  it('returns null when no integration can access the task', async () => {
    mockGetIntegrations.mockResolvedValue([integration({ credentials: { accessToken: 't' } })]);
    mockGetTaskById.mockResolvedValue(null);

    expect(await resolveTaskOwner('nope')).toBeNull();
  });

  it('refreshes and persists an expired token before probing', async () => {
    const expired = integration({
      credentials: { accessToken: 'stale', refreshToken: 'r', expiresAt: Date.now() - 1000 },
    });
    mockGetIntegrations.mockResolvedValue([expired]);
    mockRefreshToken.mockResolvedValue({ accessToken: 'fresh', refreshToken: 'r', expiresAt: Date.now() + 3_600_000 });
    mockGetTaskById.mockResolvedValue({ gid: '1', name: 'T' });

    const resolved = await resolveTaskOwner('1');

    expect(mockRefreshToken).toHaveBeenCalledWith('r', 'client', 'secret');
    expect(mockUpdateIntegration).toHaveBeenCalledWith('int-1', expect.objectContaining({
      credentials: expect.objectContaining({ accessToken: 'fresh' }),
    }));
    expect(mockGetTaskById).toHaveBeenCalledWith('fresh', '1');
    expect(resolved!.accessToken).toBe('fresh');
  });

  it('swallows a per-integration probe error and continues to the next', async () => {
    const bad = integration({ id: 'bad', name: 'Bad', credentials: { accessToken: 'tb' } });
    const good = integration({ id: 'good', name: 'Good', credentials: { accessToken: 'tg' } });
    mockGetIntegrations.mockResolvedValue([bad, good]);
    mockGetTaskById
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce({ gid: '5', name: 'Found' });

    const resolved = await resolveTaskOwner('5');

    expect(resolved!.integration.id).toBe('good');
  });
});
