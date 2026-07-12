import { NextRequest, NextResponse } from 'next/server';
import { addDays, format, startOfWeek } from 'date-fns';

import { getWorkflowConfig } from '@/lib/workflow-config-storage';
import {
  getScheduledAsanaTasks,
  getAdHocTasks,
  getCustomTaskTypes,
  getAllTaskMetadata,
} from '@/lib/user-data-storage';
import { getEnabledAsanaIntegrations, getEnabledGoogleIntegrations, updateIntegration } from '@/lib/integration-storage';
import { getIncompleteTasks, refreshAsanaToken } from '@/lib/asana';
import { ensureValidCredentials, getCalendarEvents } from '@/lib/google-calendar';
import { classifyBlockCategory, type CapacityQuota } from '@/lib/capacity';
import { eventsToBusyIntervals } from '@/lib/scheduling/free-busy';
import { proposeBlocks } from '@/lib/scheduling/engine';
import type { BusyInterval, CandidateTask } from '@/lib/scheduling/types';
import {
  AsanaIntegration,
  AsanaTask,
  BUILT_IN_TASK_TYPE_LABELS,
  BuiltInTaskType,
  CustomTaskType,
  GoogleIntegration,
  isCustomTaskType,
  getCustomTaskTypeId,
} from '@/types';

// Resolve the type signals for an ad-hoc task's taskType (id + human label).
// Mirrors the dashboard capacity route so classification stays consistent.
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

// Fetch incomplete Asana tasks across enabled integrations, tagged with their
// integration id and "Type" custom-field value.
async function fetchAsanaCandidates(): Promise<
  Array<{ task: AsanaTask; integrationId: string; typeValue: string | null }>
> {
  const out: Array<{ task: AsanaTask; integrationId: string; typeValue: string | null }> = [];
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
          out.push({ task, integrationId: integration.id, typeValue: typeField?.displayValue ?? null });
        }
      })
    );
  } catch (error) {
    console.error('[Scheduling Propose] Failed to fetch Asana tasks:', error);
  }
  return out;
}

// Fetch merged busy intervals across all enabled Google calendars for the week.
async function fetchBusyIntervals(weekStart: Date): Promise<BusyInterval[]> {
  const integrations = await getEnabledGoogleIntegrations();
  const allEvents: Array<{ startTime: Date; endTime: Date; allDay?: boolean }> = [];

  const DEFAULT_CALENDAR = { id: 'primary', backgroundColor: '#4285f4', summary: 'Primary', selected: true as const };

  await Promise.all(
    integrations.map(async (integration: GoogleIntegration) => {
      if (!integration.credentials) return;
      try {
        const credentials = await ensureValidCredentials(integration);
        const selected = integration.calendars?.filter(c => c.selected);
        const calendars = selected?.length ? selected : [DEFAULT_CALENDAR];
        for (let i = 0; i < 7; i++) {
          const day = addDays(weekStart, i);
          for (const cal of calendars) {
            try {
              const events = await getCalendarEvents(
                credentials,
                integration.clientId,
                integration.clientSecret,
                day,
                cal.id
              );
              for (const e of events) {
                allEvents.push({ startTime: e.startTime, endTime: e.endTime, allDay: e.allDay });
              }
            } catch (err) {
              console.error(`[Scheduling Propose] calendar ${cal.id} fetch failed:`, err);
            }
          }
        }
      } catch (err) {
        console.error(`[Scheduling Propose] integration ${integration.name} failed:`, err);
      }
    })
  );

  return eventsToBusyIntervals(allEvents);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const now = new Date();
    const weekStartDate = body.weekStart
      ? startOfWeek(new Date(`${body.weekStart}T00:00:00`), { weekStartsOn: 1 })
      : startOfWeek(now, { weekStartsOn: 1 });
    const weekStartStr = format(weekStartDate, 'yyyy-MM-dd');
    const weekEndStr = format(addDays(weekStartDate, 6), 'yyyy-MM-dd');

    const [config, scheduledAsana, adHocTasks, customTypes, metadata, asanaCandidates, busyIntervals] =
      await Promise.all([
        getWorkflowConfig(),
        getScheduledAsanaTasks(),
        getAdHocTasks(),
        getCustomTaskTypes(),
        getAllTaskMetadata(),
        fetchAsanaCandidates(),
        fetchBusyIntervals(weekStartDate),
      ]);

    const quotas: CapacityQuota[] = Object.entries(config.taskQuotas).map(([category, quota]) => ({
      category,
      weeklyCount: quota.weeklyCount,
      targetLength: quota.targetLength,
      types: config.typeMapping?.[category] ?? [],
    }));

    // --- Existing scheduled blocks this week (counts + per-date + exclusions) ---
    const asanaTypeByGid = new Map(asanaCandidates.map(c => [c.task.gid, c.typeValue]));
    const inWeek = (d?: string) => !!d && d >= weekStartStr && d <= weekEndStr;

    const existingScheduledCounts: Record<string, number> = {};
    const existingBlocksByDate: Record<string, number> = {};
    const scheduledGids = new Set<string>();

    const bump = (category: string | null) => {
      if (category) existingScheduledCounts[category] = (existingScheduledCounts[category] ?? 0) + 1;
    };

    for (const s of scheduledAsana) {
      if (!inWeek(s.scheduledDate)) continue;
      scheduledGids.add(s.asanaTaskId);
      existingBlocksByDate[s.scheduledDate] = (existingBlocksByDate[s.scheduledDate] ?? 0) + 1;
      const typeValue = asanaTypeByGid.get(s.asanaTaskId) ?? null;
      bump(classifyBlockCategory(typeValue ? [typeValue] : [], quotas));
    }

    const scheduledAdhocIds = new Set<string>();
    for (const t of adHocTasks) {
      if (t.completed || !inWeek(t.dueDate)) continue;
      scheduledAdhocIds.add(t.id);
      existingBlocksByDate[t.dueDate!] = (existingBlocksByDate[t.dueDate!] ?? 0) + 1;
      bump(classifyBlockCategory(adHocTypeSignals(t.taskType, customTypes), quotas));
    }

    // --- Candidate tasks (not yet scheduled this week) ---
    const candidateTasks: CandidateTask[] = [];
    for (const { task, integrationId, typeValue } of asanaCandidates) {
      if (scheduledGids.has(task.gid)) continue;
      const meta = metadata[task.gid];
      candidateTasks.push({
        gid: task.gid,
        title: task.name,
        integrationId,
        dueDate: task.dueOn,
        typeSignals: typeValue ? [typeValue] : [],
        deadlineType: meta?.deadlineType,
        bestTime: meta?.bestTime,
        energyLevel: meta?.energyLevel,
        effortMinutes: meta?.effortMinutes,
      });
    }
    for (const t of adHocTasks) {
      if (t.completed || scheduledAdhocIds.has(t.id)) continue;
      candidateTasks.push({
        adhocId: t.id,
        title: t.title,
        dueDate: t.dueDate,
        typeSignals: adHocTypeSignals(t.taskType, customTypes),
      });
    }

    const proposals = proposeBlocks({
      config,
      busyIntervals,
      candidateTasks,
      existingScheduledCounts,
      existingBlocksByDate,
      weekStart: weekStartDate,
      now,
    });

    // --- Unmet-quota summary ---
    const proposedByCategory: Record<string, number> = {};
    for (const p of proposals) {
      proposedByCategory[p.category] = (proposedByCategory[p.category] ?? 0) + 1;
    }
    const quotaSummary = quotas
      .filter(q => (q.weeklyCount ?? 0) > 0)
      .map(q => {
        const weeklyCount = q.weeklyCount ?? 0;
        const existing = existingScheduledCounts[q.category] ?? 0;
        const proposed = proposedByCategory[q.category] ?? 0;
        return {
          category: q.category,
          weeklyCount,
          existing,
          proposed,
          unmet: Math.max(0, weeklyCount - existing - proposed),
        };
      });

    return NextResponse.json({
      weekStart: weekStartStr,
      weekEnd: weekEndStr,
      proposals,
      quotaSummary,
    });
  } catch (error) {
    console.error('Error proposing weekly plan:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to propose plan' },
      { status: 500 }
    );
  }
}
