// When the server last rebuilt past days' time records from the calendar.
// Read by the Analysis page (to show "last synced") and used to debounce the
// automatic reconcile it fires on load.

import { getUserData, saveUserData } from './core';

export async function getLastReconciledAt(): Promise<string | null> {
  const data = await getUserData();
  return data.timeSyncState?.lastReconciledAt ?? null;
}

export async function setLastReconciledAt(iso: string): Promise<void> {
  const data = await getUserData();
  data.timeSyncState = { ...(data.timeSyncState ?? {}), lastReconciledAt: iso };
  await saveUserData(data);
}
