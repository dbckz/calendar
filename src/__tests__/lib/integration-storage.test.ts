/**
 * Tests for integration-storage.ts
 * Server-side storage for integration credentials
 */
import { promises as fs } from 'fs';
import {
  getIntegrations,
  saveIntegrations,
  getIntegrationById,
  getGoogleIntegrationById,
  addGoogleIntegration,
  addAsanaIntegration,
  updateIntegration,
  deleteIntegration,
  getEnabledGoogleIntegrations,
  getEnabledAsanaIntegrations,
  sanitizeIntegrations,
} from '@/lib/integration-storage';
import { MultiIntegrationSettings, GoogleIntegration, AsanaIntegration } from '@/types';

// Mock fs module
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    mkdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
  },
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('integration-storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: data dir exists
    mockFs.access.mockResolvedValue(undefined);
  });

  const mockGoogleIntegration: GoogleIntegration = {
    id: 'google-1',
    type: 'google',
    name: 'Test Google',
    enabled: true,
    clientId: 'client-id',
    clientSecret: 'client-secret',
    createdAt: '2024-01-01T00:00:00.000Z',
    credentials: {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 3600000,
    },
  };

  const mockAsanaIntegration: AsanaIntegration = {
    id: 'asana-1',
    type: 'asana',
    name: 'Test Asana',
    enabled: true,
    clientId: 'asana-client-id',
    clientSecret: 'asana-client-secret',
    workspaceId: 'workspace-1',
    createdAt: '2024-01-01T00:00:00.000Z',
    credentials: {
      accessToken: 'asana-access-token',
      refreshToken: 'asana-refresh-token',
      expiresAt: Date.now() + 3600000,
    },
  };

  const mockSettings: MultiIntegrationSettings = {
    version: 2,
    googleIntegrations: [mockGoogleIntegration],
    asanaIntegrations: [mockAsanaIntegration],
  };

  describe('getIntegrations', () => {
    it('returns stored integrations when file exists', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSettings));

      const result = await getIntegrations();

      expect(result).toEqual(mockSettings);
    });

    it('returns default settings when file does not exist', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));

      const result = await getIntegrations();

      expect(result).toEqual({
        version: 2,
        googleIntegrations: [],
        asanaIntegrations: [],
      });
    });

    it('creates data directory if it does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSettings));

      await getIntegrations();

      expect(mockFs.mkdir).toHaveBeenCalled();
    });
  });

  describe('saveIntegrations', () => {
    it('saves integrations to file', async () => {
      await saveIntegrations(mockSettings);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        JSON.stringify(mockSettings, null, 2),
        'utf-8'
      );
    });

    it('creates data directory before saving', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));

      await saveIntegrations(mockSettings);

      expect(mockFs.mkdir).toHaveBeenCalled();
    });
  });

  describe('getIntegrationById', () => {
    it('returns Google integration by ID', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSettings));

      const result = await getIntegrationById('google-1');

      expect(result).toEqual(mockGoogleIntegration);
    });

    it('returns Asana integration by ID', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSettings));

      const result = await getIntegrationById('asana-1');

      expect(result).toEqual(mockAsanaIntegration);
    });

    it('returns null for non-existent ID', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSettings));

      const result = await getIntegrationById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getGoogleIntegrationById', () => {
    it('returns Google integration by ID', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSettings));

      const result = await getGoogleIntegrationById('google-1');

      expect(result).toEqual(mockGoogleIntegration);
    });

    it('returns null for non-existent ID', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSettings));

      const result = await getGoogleIntegrationById('non-existent');

      expect(result).toBeNull();
    });

    it('returns null for Asana integration ID', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSettings));

      const result = await getGoogleIntegrationById('asana-1');

      expect(result).toBeNull();
    });
  });

  describe('addGoogleIntegration', () => {
    it('adds a new Google integration', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify({
        version: 2,
        googleIntegrations: [],
        asanaIntegrations: [],
      }));

      await addGoogleIntegration(mockGoogleIntegration);

      expect(mockFs.writeFile).toHaveBeenCalled();
      const savedData = JSON.parse(mockFs.writeFile.mock.calls[0][1] as string);
      expect(savedData.googleIntegrations).toHaveLength(1);
      expect(savedData.googleIntegrations[0].id).toBe('google-1');
    });
  });

  describe('addAsanaIntegration', () => {
    it('adds a new Asana integration', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify({
        version: 2,
        googleIntegrations: [],
        asanaIntegrations: [],
      }));

      await addAsanaIntegration(mockAsanaIntegration);

      expect(mockFs.writeFile).toHaveBeenCalled();
      const savedData = JSON.parse(mockFs.writeFile.mock.calls[0][1] as string);
      expect(savedData.asanaIntegrations).toHaveLength(1);
      expect(savedData.asanaIntegrations[0].id).toBe('asana-1');
    });
  });

  describe('updateIntegration', () => {
    it('updates a Google integration', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSettings));

      const result = await updateIntegration('google-1', { name: 'Updated Google' });

      expect(result).toBe(true);
      const savedData = JSON.parse(mockFs.writeFile.mock.calls[0][1] as string);
      expect(savedData.googleIntegrations[0].name).toBe('Updated Google');
    });

    it('updates an Asana integration', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSettings));

      const result = await updateIntegration('asana-1', { name: 'Updated Asana' });

      expect(result).toBe(true);
      const savedData = JSON.parse(mockFs.writeFile.mock.calls[0][1] as string);
      expect(savedData.asanaIntegrations[0].name).toBe('Updated Asana');
    });

    it('returns false for non-existent integration', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSettings));

      const result = await updateIntegration('non-existent', { name: 'Test' });

      expect(result).toBe(false);
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('deleteIntegration', () => {
    it('deletes a Google integration', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSettings));

      const result = await deleteIntegration('google-1');

      expect(result).toBe(true);
      const savedData = JSON.parse(mockFs.writeFile.mock.calls[0][1] as string);
      expect(savedData.googleIntegrations).toHaveLength(0);
    });

    it('deletes an Asana integration', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSettings));

      const result = await deleteIntegration('asana-1');

      expect(result).toBe(true);
      const savedData = JSON.parse(mockFs.writeFile.mock.calls[0][1] as string);
      expect(savedData.asanaIntegrations).toHaveLength(0);
    });

    it('returns false for non-existent integration', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSettings));

      const result = await deleteIntegration('non-existent');

      expect(result).toBe(false);
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('getEnabledGoogleIntegrations', () => {
    it('returns only enabled integrations with credentials', async () => {
      const settings: MultiIntegrationSettings = {
        version: 2,
        googleIntegrations: [
          mockGoogleIntegration, // enabled with credentials
          { ...mockGoogleIntegration, id: 'google-2', enabled: false }, // disabled
          { ...mockGoogleIntegration, id: 'google-3', credentials: undefined }, // no credentials
        ],
        asanaIntegrations: [],
      };
      mockFs.readFile.mockResolvedValue(JSON.stringify(settings));

      const result = await getEnabledGoogleIntegrations();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('google-1');
    });
  });

  describe('getEnabledAsanaIntegrations', () => {
    it('returns only enabled integrations with credentials and workspace', async () => {
      const settings: MultiIntegrationSettings = {
        version: 2,
        googleIntegrations: [],
        asanaIntegrations: [
          mockAsanaIntegration, // enabled with credentials and workspace
          { ...mockAsanaIntegration, id: 'asana-2', enabled: false }, // disabled
          { ...mockAsanaIntegration, id: 'asana-3', credentials: undefined }, // no credentials
          { ...mockAsanaIntegration, id: 'asana-4', workspaceId: undefined }, // no workspace
        ],
      };
      mockFs.readFile.mockResolvedValue(JSON.stringify(settings));

      const result = await getEnabledAsanaIntegrations();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('asana-1');
    });
  });

  describe('sanitizeIntegrations', () => {
    it('removes sensitive data from integrations', () => {
      const result = sanitizeIntegrations(mockSettings);

      expect(result.googleIntegrations[0]).toEqual({
        id: 'google-1',
        name: 'Test Google',
        enabled: true,
        connected: true,
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      expect(result.asanaIntegrations[0]).toEqual({
        id: 'asana-1',
        name: 'Test Asana',
        enabled: true,
        connected: true,
        workspaceId: 'workspace-1',
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      // Ensure no sensitive fields
      expect(result.googleIntegrations[0]).not.toHaveProperty('clientId');
      expect(result.googleIntegrations[0]).not.toHaveProperty('clientSecret');
      expect(result.googleIntegrations[0]).not.toHaveProperty('credentials');
    });

    it('marks integrations without credentials as not connected', () => {
      const settings: MultiIntegrationSettings = {
        version: 2,
        googleIntegrations: [
          { ...mockGoogleIntegration, credentials: undefined },
        ],
        asanaIntegrations: [
          { ...mockAsanaIntegration, credentials: undefined },
        ],
      };

      const result = sanitizeIntegrations(settings);

      expect(result.googleIntegrations[0].connected).toBe(false);
      expect(result.asanaIntegrations[0].connected).toBe(false);
    });
  });
});
