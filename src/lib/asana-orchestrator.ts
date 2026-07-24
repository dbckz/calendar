// Orchestrator-scoped Asana helpers.
//
// The headless delegation runner needs to act on Asana tasks in ANY of Dave's
// workspaces (DBC, OM, ...) via the app's own stored integrations, without
// knowing up front which integration owns a given gid. `resolveTaskOwner`
// discovers the owner by probing each enabled Asana integration in turn with a
// cheap GET /tasks/{gid}, refreshing tokens with the same idiom the dashboard
// routes use (see buildAsanaTypeMap in api/dashboard/capacity/route.ts).

import { getEnabledAsanaIntegrations, updateIntegration } from '@/lib/integration-storage';
import { getTaskById, refreshAsanaToken } from '@/lib/asana';
import { AsanaIntegration } from '@/types';

export interface ResolvedAsanaTask {
  integration: AsanaIntegration;
  accessToken: string;
  // Raw Asana task object (opt_fields from getTaskById).
  task: Record<string, unknown>;
}

// Return fresh credentials for an integration, refreshing (and persisting) the
// token when it is within 60s of expiry. Mirrors the refresh idiom used across
// the dashboard/asana-tasks routes.
async function freshAccessToken(integration: AsanaIntegration): Promise<string | null> {
  let credentials = integration.credentials;
  if (!credentials) return null;

  if (credentials.expiresAt && Date.now() >= credentials.expiresAt - 60000) {
    credentials = await refreshAsanaToken(
      credentials.refreshToken!,
      integration.clientId,
      integration.clientSecret
    );
    await updateIntegration(integration.id, { credentials });
  }
  return credentials.accessToken;
}

// Find which enabled Asana integration can see `gid` and return it alongside a
// fresh access token and the fetched task. Returns null when no integration can
// access the gid. A per-integration probe error (bad refresh, transient Asana
// error) is swallowed so one broken integration can't mask a task owned by
// another; genuine "no owner" still surfaces as null.
export async function resolveTaskOwner(gid: string): Promise<ResolvedAsanaTask | null> {
  const integrations = await getEnabledAsanaIntegrations();

  for (const integration of integrations) {
    try {
      const accessToken = await freshAccessToken(integration);
      if (!accessToken) continue;

      const task = await getTaskById(accessToken, gid);
      if (task) {
        return { integration, accessToken, task };
      }
    } catch (error) {
      console.error(
        `[asana-orchestrator] probe failed for integration ${integration.name} (${integration.id}):`,
        error
      );
    }
  }

  return null;
}

// Human-readable workspace label for error context, e.g. "DBC (My Workspace)".
export function describeIntegrations(integrations: AsanaIntegration[]): string {
  if (integrations.length === 0) return '(no enabled Asana integrations)';
  return integrations.map(i => i.name).join(', ');
}
