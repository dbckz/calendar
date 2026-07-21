// Shared week-context gathering for the "Plan my week" endpoints.
//
// Every scheduling endpoint (propose, candidates, priorities match, prep
// candidates) needs the same picture of the week: the workflow config, the
// user's incomplete tasks, the calendar's busy time and full events, and what is
// already scheduled. gatherWeekContext assembles it once — a single Google fetch
// serves both prep classification and free/busy — so the routes stay thin.

import { addDays, format, startOfWeek } from 'date-fns';

import { getWorkflowConfig, type WorkflowConfig } from '@/lib/workflow-config-storage';
import {
  getScheduledAsanaTasks,
  getAdHocTasks,
  getCustomTaskTypes,
  getAllTaskMetadata,
  getPrepBlocks,
  getRitualBlocks,
  unscheduleAsanaTask,
  updateAdHocTask,
  deletePrepBlock,
  deleteRitualBlock,
  removeGoogleEventAttribution,
  type PrepBlock,
  type RitualBlock,
} from '@/lib/user-data-storage';
import { selectStaleRecords, type ReconcileRecord } from '@/lib/scheduling/reconcile';
import { getEnabledAsanaIntegrations, getEnabledGoogleIntegrations, updateIntegration } from '@/lib/integration-storage';
import { getIncompleteTasks, refreshAsanaToken } from '@/lib/asana';
import { ensureValidCredentials, getCalendarEvents } from '@/lib/google-calendar';
import { classifyBlockCategory, type CapacityQuota } from '@/lib/capacity';
import { eventsToBusyIntervals } from '@/lib/scheduling/free-busy';
import type { BusyInterval, CandidateTask } from '@/lib/scheduling/types';
import {
  AdHocTask,
  AsanaIntegration,
  AsanaTask,
  BUILT_IN_TASK_TYPE_LABELS,
  BuiltInTaskType,
  CalendarEvent,
  CustomTaskType,
  GoogleIntegration,
  ScheduledAsanaTask,
  isCustomTaskType,
  getCustomTaskTypeId,
} from '@/types';

// A raw Asana candidate: the task plus its integration and "Type" value.
export interface AsanaCandidate {
  task: AsanaTask;
  integrationId: string;
  typeValue: string | null;
}

export interface WeekContext {
  config: WorkflowConfig;
  weekStart: Date;
  weekStartStr: string;
  weekEndStr: string;
  now: Date;
  candidateTasks: CandidateTask[]; // unscheduled Asana + ad-hoc tasks
  asanaCandidates: AsanaCandidate[]; // raw Asana tasks (for priorities matching)
  busyIntervals: BusyInterval[];
  weekEvents: CalendarEvent[]; // full events (for the prep step + "Prep:" dedupe)
  existingScheduledCounts: Record<string, number>;
  existingCategoryCountsByDate: Record<string, Record<string, number>>;
  quotas: CapacityQuota[];
}

// Resolve the type signals for an ad-hoc task's taskType (id + human label).
// Mirrors the dashboard capacity route so classification stays consistent.
export function adHocTypeSignals(taskType: string, customTypes: CustomTaskType[]): string[] {
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
async function fetchAsanaCandidates(): Promise<AsanaCandidate[]> {
  const out: AsanaCandidate[] = [];
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
    console.error('[Scheduling] Failed to fetch Asana tasks:', error);
  }
  return out;
}

// Fetch all timed/all-day events across enabled Google calendars for the week.
// One fetch serves both prep classification (needs titles/recurrence/attendees)
// and free/busy (derived via eventsToBusyIntervals).
//
// Returns the events (each tagged with the integration it came from) plus the
// set of integration ids whose fetch FULLY succeeded — every day/calendar
// sub-fetch returned without error. Reconcile only trusts "the event is gone"
// for integrations in that set, so a swallowed partial failure never triggers a
// mass purge.
export async function fetchWeekEvents(
  weekStart: Date
): Promise<{ events: CalendarEvent[]; fetchedIntegrationIds: Set<string> }> {
  const integrations = await getEnabledGoogleIntegrations();
  const allEvents: CalendarEvent[] = [];
  const fetchedIntegrationIds = new Set<string>();

  const DEFAULT_CALENDAR = { id: 'primary', backgroundColor: '#4285f4', summary: 'Primary', selected: true as const };

  await Promise.all(
    integrations.map(async (integration: GoogleIntegration) => {
      if (!integration.credentials) return;
      let fullySucceeded = true;
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
              // Tag each event with its integration so reconcile can match a
              // stored record's googleIntegrationId to the calendar it lives on.
              for (const e of events) allEvents.push({ ...e, integrationId: integration.id });
            } catch (err) {
              fullySucceeded = false;
              console.error(`[Scheduling] calendar ${cal.id} fetch failed:`, err);
            }
          }
        }
      } catch (err) {
        fullySucceeded = false;
        console.error(`[Scheduling] integration ${integration.name} failed:`, err);
      }
      if (fullySucceeded) fetchedIntegrationIds.add(integration.id);
    })
  );

  return { events: allEvents, fetchedIntegrationIds };
}

// Purge stored records whose backing Google event has been deleted off the
// calendar, then return the in-week arrays with those purges applied so the rest
// of gather sees reality: a deleted Asana block's gid drops back into
// candidates, a deleted ad-hoc block becomes unscheduled, a deleted prep block
// is removed and re-proposable. Only records on fully-fetched integrations are
// touched (see selectStaleRecords).
async function reconcileDeletedEvents(
  scheduledAsana: ScheduledAsanaTask[],
  adHocTasks: AdHocTask[],
  prepBlocks: PrepBlock[],
  ritualBlocks: RitualBlock[],
  weekEvents: CalendarEvent[],
  fetchedIntegrationIds: Set<string>,
  weekStartStr: string,
  weekEndStr: string
): Promise<{ scheduledAsana: ScheduledAsanaTask[]; adHocTasks: AdHocTask[] }> {
  const presentEventIds = new Set(weekEvents.map(e => e.id));

  const records: ReconcileRecord[] = [];
  for (const s of scheduledAsana) {
    if (!s.googleEventId) continue;
    records.push({
      kind: 'asana',
      id: s.id,
      googleEventId: s.googleEventId,
      googleIntegrationId: s.googleIntegrationId,
      date: s.scheduledDate,
    });
  }
  for (const t of adHocTasks) {
    if (!t.googleEventId) continue;
    records.push({
      kind: 'adhoc',
      id: t.id,
      googleEventId: t.googleEventId,
      googleIntegrationId: t.googleIntegrationId,
      date: t.dueDate,
    });
  }
  for (const p of prepBlocks) {
    records.push({
      kind: 'prep',
      id: p.id,
      googleEventId: p.googleEventId,
      googleIntegrationId: p.googleIntegrationId,
      date: p.date,
    });
  }
  for (const r of ritualBlocks) {
    records.push({
      kind: 'ritual',
      id: r.id,
      googleEventId: r.googleEventId,
      googleIntegrationId: r.googleIntegrationId,
      date: r.date,
    });
  }

  const stale = selectStaleRecords({
    records,
    presentEventIds,
    fetchedIntegrationIds,
    weekStartStr,
    weekEndStr,
  });
  if (stale.length === 0) return { scheduledAsana, adHocTasks };

  const staleAsanaIds = new Set<string>();
  const staleAdhocIds = new Set<string>();
  const purgedEventIds = new Set<string>();
  for (const r of stale) {
    purgedEventIds.add(r.googleEventId);
    if (r.kind === 'asana') {
      await unscheduleAsanaTask(r.id);
      staleAsanaIds.add(r.id);
    } else if (r.kind === 'adhoc') {
      await updateAdHocTask(r.id, { googleEventId: undefined, dueDate: undefined, dueTime: undefined });
      staleAdhocIds.add(r.id);
    } else if (r.kind === 'ritual') {
      await deleteRitualBlock(r.id);
    } else {
      await deletePrepBlock(r.id);
    }
  }
  // Any time-tracking attribution for a purged event is now meaningless.
  for (const eventId of purgedEventIds) await removeGoogleEventAttribution(eventId);

  console.log(
    `[Scheduling] Reconcile purged ${stale.length} record(s) for deleted calendar events: ` +
      stale.map(r => `${r.kind}:${r.id}→${r.googleEventId}`).join(', ')
  );

  return {
    scheduledAsana: scheduledAsana.filter(s => !staleAsanaIds.has(s.id)),
    adHocTasks: adHocTasks.map(t =>
      staleAdhocIds.has(t.id)
        ? { ...t, googleEventId: undefined, dueDate: undefined, dueTime: undefined }
        : t
    ),
  };
}

export async function gatherWeekContext(weekStartParam?: string): Promise<WeekContext> {
  const now = new Date();
  const weekStart = weekStartParam
    ? startOfWeek(new Date(`${weekStartParam}T00:00:00`), { weekStartsOn: 1 })
    : startOfWeek(now, { weekStartsOn: 1 });
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  const weekEndStr = format(addDays(weekStart, 6), 'yyyy-MM-dd');

  const [config, scheduledAsanaRaw, adHocTasksRaw, customTypes, metadata, asanaCandidates, fetched, prepBlocksRaw, ritualBlocksRaw] =
    await Promise.all([
      getWorkflowConfig(),
      getScheduledAsanaTasks(),
      getAdHocTasks(),
      getCustomTaskTypes(),
      getAllTaskMetadata(),
      fetchAsanaCandidates(),
      fetchWeekEvents(weekStart),
      getPrepBlocks(),
      getRitualBlocks(),
    ]);

  const weekEvents = fetched.events;

  // --- Reconcile stored records with the live calendar (deleted events) ---
  // A stored record whose backing event has been deleted off the calendar must
  // not keep suppressing candidates / consuming quota. selectStaleRecords is
  // conservative: it only flags records on integrations whose fetch fully
  // succeeded (never on a failed/partial fetch), so we don't mass-purge on a
  // transient Google error.
  const { scheduledAsana, adHocTasks } = await reconcileDeletedEvents(
    scheduledAsanaRaw,
    adHocTasksRaw,
    prepBlocksRaw,
    ritualBlocksRaw,
    weekEvents,
    fetched.fetchedIntegrationIds,
    weekStartStr,
    weekEndStr
  );

  const busyIntervals = eventsToBusyIntervals(weekEvents);

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
  const existingCategoryCountsByDate: Record<string, Record<string, number>> = {};
  const scheduledGids = new Set<string>();

  const bump = (category: string | null, date: string) => {
    if (!category) return;
    existingScheduledCounts[category] = (existingScheduledCounts[category] ?? 0) + 1;
    const byCat = (existingCategoryCountsByDate[date] ??= {});
    byCat[category] = (byCat[category] ?? 0) + 1;
  };

  // Grouped-block tasks (e.g. Engagement / Outreach) all point at the SAME Google
  // event, so count that block once even though it records several scheduled
  // tasks — otherwise remaining quota / per-category spread counts would be
  // over-counted on a mid-week re-run. Single-task blocks each have a unique
  // event, so this is a no-op for them; entries without an event id are always
  // counted.
  const countedEvents = new Set<string>();
  for (const s of scheduledAsana) {
    if (!inWeek(s.scheduledDate)) continue;
    scheduledGids.add(s.asanaTaskId); // every listed task still drops from candidates
    if (s.googleEventId) {
      if (countedEvents.has(s.googleEventId)) continue;
      countedEvents.add(s.googleEventId);
    }
    const typeValue = asanaTypeByGid.get(s.asanaTaskId) ?? null;
    bump(classifyBlockCategory(typeValue ? [typeValue] : [], quotas), s.scheduledDate);
  }

  const scheduledAdhocIds = new Set<string>();
  for (const t of adHocTasks) {
    if (t.completed || !inWeek(t.dueDate)) continue;
    scheduledAdhocIds.add(t.id);
    bump(classifyBlockCategory(adHocTypeSignals(t.taskType, customTypes), quotas), t.dueDate!);
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

  return {
    config,
    weekStart,
    weekStartStr,
    weekEndStr,
    now,
    candidateTasks,
    asanaCandidates,
    busyIntervals,
    weekEvents,
    existingScheduledCounts,
    existingCategoryCountsByDate,
    quotas,
  };
}
