// Server-side storage for integration credentials
// Uses file-based storage in ~/.claude/data/calendar/ for persistence across builds

import { promises as fs } from 'fs';
import {
  MultiIntegrationSettings,
  GoogleIntegration,
  GoogleSubCalendar,
  AsanaIntegration,
  Integration,
} from '@/types';
import { DATA_DIR, INTEGRATIONS_FILE as STORAGE_FILE } from './data-paths';

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
  let data: string;
  try {
    await ensureDataDir();
    data = await fs.readFile(STORAGE_FILE, 'utf-8');
  } catch {
    // File doesn't exist yet, return defaults
    return { ...DEFAULT_SETTINGS };
  }

  // Parse and validate. A malformed or pre-v2 (v1) file must fail loudly
  // rather than be silently coerced into a broken v2 object — the v1->v2
  // migration path has been removed, so old configs can no longer be
  // upgraded automatically.
  const parsed = JSON.parse(data) as unknown;
  assertV2Settings(parsed);
  return parsed;
}

// Throws a clear, actionable error if the stored config is the legacy v1
// shape (single `googleCalendar`/`asana` object, or `version: 1`) instead of
// the v2 multi-integration shape. v1 support was removed; there is no
// automatic migration anymore.
function assertV2Settings(parsed: unknown): asserts parsed is MultiIntegrationSettings {
  const obj = (parsed ?? {}) as Record<string, unknown>;
  const looksLegacy =
    obj.version === 1 ||
    'googleCalendar' in obj ||
    'asana' in obj ||
    !Array.isArray(obj.googleIntegrations) ||
    !Array.isArray(obj.asanaIntegrations);

  if (obj.version !== 2 || looksLegacy) {
    throw new Error(
      `Integrations config at ${STORAGE_FILE} is not in the expected v2 ` +
        `multi-integration format (found ${JSON.stringify(
          obj.version ?? 'no version field'
        )}). This config predates v2 and can no longer be migrated ` +
        `automatically. Back up the file, then delete it and re-add your ` +
        `Google/Asana integrations via the settings UI to regenerate it in ` +
        `the v2 format.`
    );
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
  settings.asanaIntegrations.push(integration);
  await saveIntegrations(settings);
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
    calendars?: GoogleSubCalendar[];
  }>;
  asanaIntegrations: Array<{
    id: string;
    name: string;
    enabled: boolean;
    connected: boolean;
    workspaceId?: string;
    createdAt: string;
    eventGoogleIntegrationId?: string;
    eventTransparency?: 'opaque' | 'transparent';
  }>;
} {
  return {
    googleIntegrations: settings.googleIntegrations.map(i => ({
      id: i.id,
      name: i.name,
      enabled: i.enabled,
      connected: !!i.credentials?.accessToken,
      createdAt: i.createdAt,
      calendars: i.calendars,
    })),
    asanaIntegrations: settings.asanaIntegrations.map(i => ({
      id: i.id,
      name: i.name,
      enabled: i.enabled,
      connected: !!i.credentials?.accessToken,
      workspaceId: i.workspaceId,
      createdAt: i.createdAt,
      eventGoogleIntegrationId: i.eventGoogleIntegrationId,
      eventTransparency: i.eventTransparency,
    })),
  };
}
