import { NextResponse } from 'next/server';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { getIncompleteTasks, refreshAsanaToken } from '@/lib/asana';
import { getEnabledAsanaIntegrations, updateIntegration } from '@/lib/integration-storage';
import {
  getScheduledAsanaTasks,
  getAllDelegationEntries,
  getAllTaskMetadata,
  upsertTaskMetadata,
} from '@/lib/user-data-storage';
import { AsanaIntegration, AsanaTask } from '@/types';

// One-off bootstrap: mark every incomplete task that is already "in flight"
// (scheduled this week, in the delegation queue, or flagged AI-delegable) as
// groomed, so the backlog view starts from a sensible baseline. Idempotent —
// re-running only writes tasks that are not yet groomed.
export async function POST() {
  try {
    const integrations = await getEnabledAsanaIntegrations();

    // Enumerate all incomplete tasks across every enabled integration.
    const results = await Promise.allSettled(
      integrations.map(async (integration) => {
        const tasks = await fetchIncompleteTasks(integration);
        return tasks.map(task => ({ task, integrationId: integration.id }));
      })
    );

    const allTasks: Array<{ task: AsanaTask; integrationId: string }> = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allTasks.push(...result.value);
      } else {
        console.error(
          `[Grooming bootstrap] Error fetching from "${integrations[index].name}":`,
          result.reason
        );
      }
    });

    // Build the "already in flight" gid set.
    const now = new Date();
    const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');

    const [scheduled, delegation, metadata] = await Promise.all([
      getScheduledAsanaTasks(),
      getAllDelegationEntries(),
      getAllTaskMetadata(),
    ]);

    const groomedGids = new Set<string>();

    // a. Scheduled this week.
    for (const s of scheduled) {
      if (s.scheduledDate >= weekStart && s.scheduledDate <= weekEnd) {
        groomedGids.add(s.asanaTaskId);
      }
    }

    // b. In the delegation queue (any state).
    for (const gid of Object.keys(delegation)) {
      groomedGids.add(gid);
    }

    // c. Flagged AI-delegable in metadata.
    for (const [gid, meta] of Object.entries(metadata)) {
      if (meta.aiDelegable === true) groomedGids.add(gid);
    }

    // Mark matching, not-already-groomed tasks as groomed.
    const nowIso = now.toISOString();
    let marked = 0;
    for (const { task, integrationId } of allTasks) {
      if (!groomedGids.has(task.gid)) continue;
      if (metadata[task.gid]?.groomed) continue;
      await upsertTaskMetadata(task.gid, integrationId, {
        groomed: true,
        groomedAt: nowIso,
      });
      marked += 1;
    }

    const total = allTasks.length;
    // Groomed = tasks now considered groomed (pre-existing groomed + newly marked),
    // counted against the live incomplete-task set.
    const groomed = allTasks.filter(
      ({ task }) => groomedGids.has(task.gid) || metadata[task.gid]?.groomed
    ).length;

    return NextResponse.json({
      total,
      groomed,
      backlog: total - groomed,
      marked,
    });
  } catch (error) {
    console.error('[Grooming bootstrap] Failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bootstrap failed' },
      { status: 500 }
    );
  }
}

async function fetchIncompleteTasks(integration: AsanaIntegration): Promise<AsanaTask[]> {
  if (!integration.credentials || !integration.workspaceId) {
    return [];
  }

  let credentials = integration.credentials;

  if (credentials.expiresAt && Date.now() >= credentials.expiresAt - 60000) {
    credentials = await refreshAsanaToken(
      credentials.refreshToken!,
      integration.clientId,
      integration.clientSecret
    );
    await updateIntegration(integration.id, { credentials });
  }

  return getIncompleteTasks(credentials.accessToken, integration.workspaceId);
}
