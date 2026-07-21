// Asana task-list filter preferences, stored per integration (keyed by
// integration id, with "default" as the fallback key).

import { AsanaFilterState } from '@/types';
import { getUserData, saveUserData, DEFAULT_ASANA_FILTERS } from './core';

export async function getAsanaFilterPreferences(integrationId?: string): Promise<AsanaFilterState> {
  const data = await getUserData();
  const key = integrationId || 'default';
  const filters = data.asanaFilterPreferencesMap?.[key];
  return filters ? { ...DEFAULT_ASANA_FILTERS, ...filters } : DEFAULT_ASANA_FILTERS;
}

export async function getAllAsanaFilterPreferences(): Promise<Record<string, AsanaFilterState>> {
  const data = await getUserData();
  return data.asanaFilterPreferencesMap || {};
}

export async function saveAsanaFilterPreferences(filters: AsanaFilterState, integrationId?: string): Promise<void> {
  const data = await getUserData();
  const key = integrationId || 'default';
  if (!data.asanaFilterPreferencesMap) {
    data.asanaFilterPreferencesMap = {};
  }
  data.asanaFilterPreferencesMap[key] = filters;
  await saveUserData(data);
}
