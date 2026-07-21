import { NextResponse } from 'next/server';
import { format, startOfWeek, endOfWeek } from 'date-fns';

import { getWorkflowConfig } from '@/lib/workflow-config-storage';
import { getScheduledAsanaTasks, getAdHocTasks, getCustomTaskTypes } from '@/lib/user-data-storage';
import { getDailyRecord } from '@/lib/time-tracking-storage';
import { getEnabledAsanaIntegrations, updateIntegration } from '@/lib/integration-storage';
import { getIncompleteTasks, refreshAsanaToken } from '@/lib/asana';
import {
  CapacityQuota,
  CapacityBlock,
  computeCapacity,
  dedupeByEventId,
} from '@/lib/capacity';
import {
  AsanaIntegration,
  BUILT_IN_TASK_TYPE_LABELS,
  BuiltInTaskType,
  CustomTaskType,
  isCustomTaskType,
  getCustomTaskTypeId,
} from '@/types';

// Build a gid -> { typeValue, completed } map from incomplete Asana tasks.
// Best-effort: if Asana can't be reached, Asana blocks are left unclassified.
async function buildAsanaTypeMap(): Promise<Map<string, { typeValue: string | null; completed: boolean }>> {
  const map = new Map<string, { typeValue: string | null; completed: boolean }>();
  try {
    const integrations = await getEnabledAsanaIntegrations();
    await Promise.all(
      integrations.map(async (integration: AsanaIntegration) => {
        if (!integration.credentials || !integration.workspaceId) return;
        let credentials = integration.credentials;
        if (credentials.expiresAt && Date.now() >= credentials.expiresAt - 60000) {
          credentials = await refreshAsanaToken(
            credentials.refreshToken!,
            integration.clientId,
            integration.clientSecret
          );
          await updateIntegration(integration.id, { credentials });
        }
        const tasks = await getIncompleteTasks(credentials.accessToken, integration.workspaceId);
        for (const task of tasks) {
          const typeField = task.customFields?.find(cf => cf.name.toLowerCase() === 'type');
          map.set(task.gid, {
            typeValue: typeField?.displayValue ?? null,
            completed: task.completed,
          });
        }
      })
    );
  } catch (error) {
    console.error('[Dashboard Capacity] Failed to fetch Asana tasks for type map:', error);
  }
  return map;
}

// Resolve the type signals for an ad-hoc task's taskType (id + human label).
function adHocTypeSignals(taskType: string, customTypes: CustomTaskType[]): string[] {
  const signals = [taskType];
  if (isCustomTaskType(taskType as `custom:${string}`)) {
    const id = getCustomTaskTypeId(taskType as `custom:${string}`);
    const custom = customTypes.find(c => c.id === id);
    if (custom) signals.push(custom.label);
  } else {
    const label = BUILT_IN_TASK_TYPE_LABELS[taskType as BuiltInTaskType];
    if (label) signals.push(label);
  }
  return signals;
}

export async function GET() {
  try {
    const now = new Date();
    const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const today = format(now, 'yyyy-MM-dd');

    const [config, scheduledAsana, adHocTasks, customTypes, asanaTypeMap] = await Promise.all([
      getWorkflowConfig(),
      getScheduledAsanaTasks(),
      getAdHocTasks(),
      getCustomTaskTypes(),
      buildAsanaTypeMap(),
    ]);

    const quotas: CapacityQuota[] = Object.entries(config.taskQuotas).map(
      ([category, quota]) => ({
        category,
        weeklyCount: quota.weeklyCount,
        targetLength: quota.targetLength,
        types: config.typeMapping?.[category] ?? [],
      })
    );

    // App-scheduled blocks in the current ISO week. Grouped categories (e.g.
    // Batch, Engagement) store one record per agenda task — Asana tasks AND
    // ad-hoc tasks alike — all pointing at the SAME container event id; the
    // weekly quota counts BLOCKS. So we combine both record types and dedupe by
    // googleEventId across the COMBINED set (matching gatherWeekContext):
    // records sharing an event id collapse to one block, records with no event
    // id (each its own block) always count. Deduping per-type would over-count a
    // Batch block that carries several ad-hoc tasks (N ad-hoc → N blocks) and
    // could double-count an event carrying both an Asana and an ad-hoc record.
    interface WeekRecord {
      googleEventId?: string | null;
      block: CapacityBlock;
    }
    const records: WeekRecord[] = [];

    for (const s of scheduledAsana) {
      if (s.scheduledDate < weekStart || s.scheduledDate > weekEnd) continue;
      const info = asanaTypeMap.get(s.asanaTaskId);
      records.push({
        googleEventId: s.googleEventId,
        block: {
          typeSignals: info?.typeValue ? [info.typeValue] : [],
          minutes: s.duration,
          completed: info?.completed ?? false,
        },
      });
    }
    for (const t of adHocTasks) {
      if (!t.dueDate || t.dueDate < weekStart || t.dueDate > weekEnd) continue;
      records.push({
        googleEventId: t.googleEventId,
        block: {
          typeSignals: adHocTypeSignals(t.taskType, customTypes),
          minutes: t.duration ?? 30,
          completed: t.completed,
        },
      });
    }

    const blocks = dedupeByEventId(records, r => r.googleEventId).map(r => r.block);

    const capacity = computeCapacity(quotas, blocks);

    // Client time worked today, per Asana integration, from recorded time tracking
    const dailyRecord = await getDailyRecord(today);
    const clientTime = dailyRecord
      ? Object.values(dailyRecord.integrationTotals).map(t => ({
          integrationId: t.integrationId,
          integrationName: t.integrationName,
          totalMinutes: t.totalMinutes,
        }))
      : [];

    return NextResponse.json({ weekStart, weekEnd, capacity, clientTime });
  } catch (error) {
    console.error('Error computing dashboard capacity:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to compute capacity' },
      { status: 500 }
    );
  }
}
