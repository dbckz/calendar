// Migration utility to convert legacy settings to multi-integration format

import { cookies } from 'next/headers';
import {
  LegacyAppSettings,
  MultiIntegrationSettings,
  GoogleIntegration,
  AsanaIntegration,
} from '@/types';
import { saveIntegrations, getIntegrations } from './integration-storage';

function generateId(): string {
  return crypto.randomUUID();
}

export async function migrateFromCookie(): Promise<{
  migrated: boolean;
  settings: MultiIntegrationSettings;
}> {
  const cookieStore = await cookies();
  const settingsCookie = cookieStore.get('planner-settings')?.value;

  if (!settingsCookie) {
    // No cookie, return fresh settings
    const settings = await getIntegrations();
    return { migrated: false, settings };
  }

  let parsedCookie: unknown;
  try {
    parsedCookie = JSON.parse(settingsCookie);
  } catch {
    const settings = await getIntegrations();
    return { migrated: false, settings };
  }

  // Check if already migrated (version 2 in file storage)
  const existingSettings = await getIntegrations();
  if (
    existingSettings.googleIntegrations.length > 0 ||
    existingSettings.asanaIntegrations.length > 0
  ) {
    // Already have integrations in new storage, don't migrate again
    return { migrated: false, settings: existingSettings };
  }

  // Check if cookie has legacy format
  const legacy = parsedCookie as LegacyAppSettings;
  if (!legacy.googleCalendar && !legacy.asana) {
    return { migrated: false, settings: existingSettings };
  }

  // Perform migration
  const migrated: MultiIntegrationSettings = {
    version: 2,
    googleIntegrations: [],
    asanaIntegrations: [],
  };

  // Migrate Google Calendar if configured
  if (legacy.googleCalendar?.clientId) {
    const googleIntegration: GoogleIntegration = {
      id: generateId(),
      type: 'google',
      name: 'Google Calendar',
      enabled: legacy.googleCalendar.enabled,
      clientId: legacy.googleCalendar.clientId,
      clientSecret: legacy.googleCalendar.clientSecret,
      credentials: legacy.googleCalendar.credentials,
      createdAt: new Date().toISOString(),
    };
    migrated.googleIntegrations.push(googleIntegration);
  }

  // Migrate Asana if configured
  if (legacy.asana?.clientId) {
    const asanaIntegration: AsanaIntegration = {
      id: generateId(),
      type: 'asana',
      name: 'Asana',
      enabled: legacy.asana.enabled,
      clientId: legacy.asana.clientId,
      clientSecret: legacy.asana.clientSecret,
      credentials: legacy.asana.credentials,
      workspaceId: legacy.asana.workspaceId,
      createdAt: new Date().toISOString(),
    };
    migrated.asanaIntegrations.push(asanaIntegration);
  }

  // Save migrated settings to file storage
  await saveIntegrations(migrated);

  // Clear the old cookie after successful migration
  cookieStore.delete('planner-settings');

  return { migrated: true, settings: migrated };
}
