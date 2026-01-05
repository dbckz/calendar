// Server-side storage for integration credentials
// Uses file-based storage to avoid 4KB cookie limit

import { promises as fs } from 'fs';
import path from 'path';
import {
  MultiIntegrationSettings,
  GoogleIntegration,
  AsanaIntegration,
  Integration,
} from '@/types';

const DATA_DIR = path.join(process.cwd(), '.data');
const STORAGE_FILE = path.join(DATA_DIR, 'integrations.json');

const DEFAULT_SETTINGS: MultiIntegrationSettings = {
  version: 2,
  googleIntegrations: [],
  asanaIntegrations: [],
};

async function ensureDataDir(): Promise<void> {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

export async function getIntegrations(): Promise<MultiIntegrationSettings> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(STORAGE_FILE, 'utf-8');
    return JSON.parse(data) as MultiIntegrationSettings;
  } catch {
    // File doesn't exist yet, return defaults
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveIntegrations(settings: MultiIntegrationSettings): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(STORAGE_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

export async function getIntegrationById(id: string): Promise<Integration | null> {
  const settings = await getIntegrations();

  const google = settings.googleIntegrations.find(i => i.id === id);
  if (google) return google;

  const asana = settings.asanaIntegrations.find(i => i.id === id);
  if (asana) return asana;

  return null;
}

export async function getGoogleIntegrationById(id: string): Promise<GoogleIntegration | null> {
  const settings = await getIntegrations();
  return settings.googleIntegrations.find(i => i.id === id) || null;
}

export async function addGoogleIntegration(integration: GoogleIntegration): Promise<void> {
  const settings = await getIntegrations();
  settings.googleIntegrations.push(integration);
  await saveIntegrations(settings);
}

export async function addAsanaIntegration(integration: AsanaIntegration): Promise<void> {
  const settings = await getIntegrations();
  console.log('[Storage] Current Asana integrations before add:', settings.asanaIntegrations.map(i => i.id));
  settings.asanaIntegrations.push(integration);
  console.log('[Storage] Asana integrations after add:', settings.asanaIntegrations.map(i => i.id));
  await saveIntegrations(settings);
  console.log('[Storage] Saved to file');
}

export async function updateIntegration(
  id: string,
  updates: Partial<Integration>
): Promise<boolean> {
  const settings = await getIntegrations();

  // Check Google integrations
  const googleIdx = settings.googleIntegrations.findIndex(i => i.id === id);
  if (googleIdx !== -1) {
    settings.googleIntegrations[googleIdx] = {
      ...settings.googleIntegrations[googleIdx],
      ...updates,
    } as GoogleIntegration;
    await saveIntegrations(settings);
    return true;
  }

  // Check Asana integrations
  const asanaIdx = settings.asanaIntegrations.findIndex(i => i.id === id);
  if (asanaIdx !== -1) {
    settings.asanaIntegrations[asanaIdx] = {
      ...settings.asanaIntegrations[asanaIdx],
      ...updates,
    } as AsanaIntegration;
    await saveIntegrations(settings);
    return true;
  }

  return false;
}

export async function deleteIntegration(id: string): Promise<boolean> {
  const settings = await getIntegrations();

  const googleIdx = settings.googleIntegrations.findIndex(i => i.id === id);
  if (googleIdx !== -1) {
    settings.googleIntegrations.splice(googleIdx, 1);
    await saveIntegrations(settings);
    return true;
  }

  const asanaIdx = settings.asanaIntegrations.findIndex(i => i.id === id);
  if (asanaIdx !== -1) {
    settings.asanaIntegrations.splice(asanaIdx, 1);
    await saveIntegrations(settings);
    return true;
  }

  return false;
}

// Get enabled Google integrations with credentials
export async function getEnabledGoogleIntegrations(): Promise<GoogleIntegration[]> {
  const settings = await getIntegrations();
  return settings.googleIntegrations.filter(i => i.enabled && i.credentials);
}

// Get enabled Asana integrations with credentials
export async function getEnabledAsanaIntegrations(): Promise<AsanaIntegration[]> {
  const settings = await getIntegrations();
  return settings.asanaIntegrations.filter(i => i.enabled && i.credentials && i.workspaceId);
}

// Sanitize settings for client (remove secrets)
export function sanitizeIntegrations(settings: MultiIntegrationSettings): {
  googleIntegrations: Array<{
    id: string;
    name: string;
    enabled: boolean;
    connected: boolean;
    createdAt: string;
  }>;
  asanaIntegrations: Array<{
    id: string;
    name: string;
    enabled: boolean;
    connected: boolean;
    workspaceId?: string;
    createdAt: string;
  }>;
} {
  return {
    googleIntegrations: settings.googleIntegrations.map(i => ({
      id: i.id,
      name: i.name,
      enabled: i.enabled,
      connected: !!i.credentials?.accessToken,
      createdAt: i.createdAt,
    })),
    asanaIntegrations: settings.asanaIntegrations.map(i => ({
      id: i.id,
      name: i.name,
      enabled: i.enabled,
      connected: !!i.credentials?.accessToken,
      workspaceId: i.workspaceId,
      createdAt: i.createdAt,
    })),
  };
}
