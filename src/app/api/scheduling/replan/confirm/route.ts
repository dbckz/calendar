import { NextRequest, NextResponse } from 'next/server';
import { addDays, format, startOfWeek } from 'date-fns';

import { deleteCalendarEvent, ensureValidCredentials, updateCalendarEvent } from '@/lib/google-calendar';
import { completeTask, refreshAsanaToken } from '@/lib/asana';
import {
  getEnabledGoogleIntegrations,
  getGoogleIntegrationById,
  getIntegrationById,
  updateIntegration,
} from '@/lib/integration-storage';
import { getWorkflowConfig } from '@/lib/workflow-config-storage';
import { createRitualEvent } from '@/lib/scheduling/ritual-events';
import { ritualIntegrationIdForBlock } from '@/lib/scheduling/rituals';
import type { ProposedBlock } from '@/lib/scheduling/types';
import {
  getAdHocTasks,
  getPrepBlocks,
  getRitualBlocks,
  getScheduledAsanaTasks,
  addAdHocTask,
  updateAdHocTask,
  updatePrepBlock,
  deletePrepBlock,
  deleteRitualBlock,
  unscheduleAsanaTask,
  scheduleAsanaTask,
  setBlockDoneOverride,
  removeGoogleEventAttribution,
  removeBlockDoneOverride,
  setTaskDeferrals,
  updateScheduledAsanaTasksByGoogleEvent,
} from '@/lib/user-data-storage';
import type { ReviewAdoptInput } from '@/lib/scheduling/daily-review';
import type { AsanaIntegration, GoogleCalendarCredentials, GoogleIntegration } from '@/types';

// One accepted move: patch the existing Google event to a new time and update
// the stored schedule for its linked work.
interface MoveInput {
  googleEventId: string;
  googleIntegrationId?: string;
  date: string; // yyyy-MM-dd
  start: string; // HH:mm
  durationMinutes: number;
}

interface MoveResult {
  googleEventId: string;
  success: boolean;
  error?: string;
}

interface DoneResult {
  googleEventId: string;
  success: boolean;
  error?: string;
}

// One adopted bare calendar event (daily review): a not-done Google event with no
// local record turned into a scheduled Asana block (gid set) or an ad-hoc task,
// so the replan step re-slots it like any other missed work.
interface AdoptResult {
  googleEventId: string;
  success: boolean;
  error?: string;
}

interface AsanaCompleteInput {
  gid: string;
  integrationId: string;
}

interface AsanaCompleteResult {
  gid: string;
  success: boolean;
  error?: string;
}

// One deferred unplaceable block: its backing task ids are parked until next
// Monday, and any planning override on its event is cleared.
interface DeferInput {
  taskIds: string[];
  googleEventId?: string;
}

interface DeferResult {
  taskIds: string[];
  googleEventId?: string;
  success: boolean;
  error?: string;
}

// One "prioritise tomorrow" victim: its calendar event is removed and its stored
// schedule cleared, freeing the slot for the prioritised block (which arrives as
// a normal move). Its tasks are then deferred to next week ('defer') or left in
// the pool to be re-planned ('leave') — the same disposition unplaceable blocks
// get.
interface DisplaceInput {
  googleEventId: string;
  googleIntegrationId?: string;
  taskIds: string[];
  mode: 'defer' | 'leave';
  // The victim's own slot length and the prioritised block that will fill it. A
  // victim shorter than the prioritised block is rejected, so the freed slot
  // always fits without overlapping whatever follows it.
  durationMinutes?: number;
  priorityDurationMinutes?: number;
}

interface DisplaceResult {
  googleEventId: string;
  success: boolean;
  error?: string;
}

// One created ritual addition, reported back by its proposal id.
interface AdditionResult {
  id: string;
  success: boolean;
  googleEventId?: string;
  error?: string;
}

function toStartEnd(date: string, start: string, durationMinutes: number): { start: Date; end: Date } {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, m] = start.split(':').map(Number);
  const startDate = new Date(y, mo - 1, d, h, m, 0, 0);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
  return { start: startDate, end: endDate };
}

// A calendar delete that 404s/410s means the event is already gone — the caller
// treats that as success rather than an error.
function isEventGoneError(err: unknown): boolean {
  const status =
    (err as { code?: number; status?: number; response?: { status?: number } })?.code ??
    (err as { status?: number })?.status ??
    (err as { response?: { status?: number } })?.response?.status;
  return status === 404 || status === 410;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const moves: MoveInput[] = Array.isArray(body?.moves) ? body.moves : [];
    // Event ids the user chose to mark "done" instead of rescheduling. Ownership
    // is resolved server-side: prep block → done:true, ad-hoc → completed:true,
    // Asana-backed → a planning override (the Asana task itself stays open).
    const doneEventIds: string[] = Array.isArray(body?.done)
      ? body.done.filter((id: unknown): id is string => typeof id === 'string')
      : [];
    // Event ids the user marked "not done" in the daily review: reverse whatever
    // made the block read as done — prep block → done:false, ad-hoc → completed:false,
    // else clear the planning override — so the next analyze classifies it as missed.
    const notDoneEventIds: string[] = Array.isArray(body?.notDone)
      ? body.notDone.filter((id: unknown): id is string => typeof id === 'string')
      : [];
    // Asana tasks to complete in Asana (daily review "Complete in Asana"). Once
    // completed they drop out of the next analyze's incomplete-task fetch.
    const asanaCompletions: AsanaCompleteInput[] = Array.isArray(body?.completeAsana)
      ? body.completeAsana.filter(
          (a: unknown): a is AsanaCompleteInput =>
            !!a &&
            typeof a === 'object' &&
            typeof (a as { gid?: unknown }).gid === 'string' &&
            typeof (a as { integrationId?: unknown }).integrationId === 'string'
        )
      : [];
    // Unplaceable blocks the user deferred to next week: park their tasks and
    // clear any planning override (the past block record itself stays as history).
    const deferInputs: DeferInput[] = Array.isArray(body?.defer)
      ? body.defer
          .filter(
            (d: unknown): d is { taskIds?: unknown; googleEventId?: unknown } =>
              !!d && typeof d === 'object'
          )
          .map((d: { taskIds?: unknown; googleEventId?: unknown }) => ({
            taskIds: Array.isArray(d.taskIds)
              ? d.taskIds.filter((t: unknown): t is string => typeof t === 'string')
              : [],
            googleEventId: typeof d.googleEventId === 'string' ? d.googleEventId : undefined,
          }))
          .filter((d: DeferInput) => d.taskIds.length > 0 || d.googleEventId)
      : [];
    // Unplaceable blocks the user chose to leave unscheduled: no deferral, just
    // clear any stale planning override so the row stops reading as done.
    const leaveEventIds: string[] = Array.isArray(body?.leaveUnscheduled)
      ? body.leaveUnscheduled.filter((id: unknown): id is string => typeof id === 'string')
      : [];
    // "Prioritise tomorrow" victims: displace each so its tomorrow slot frees up
    // for the prioritised block (which comes through as a normal move).
    const displaceInputs: DisplaceInput[] = Array.isArray(body?.displace)
      ? body.displace
          .filter(
            (d: unknown): d is { googleEventId: string } =>
              !!d && typeof d === 'object' && typeof (d as { googleEventId?: unknown }).googleEventId === 'string'
          )
          .map(
            (d: {
              googleEventId: string;
              googleIntegrationId?: unknown;
              taskIds?: unknown;
              mode?: unknown;
              durationMinutes?: unknown;
              priorityDurationMinutes?: unknown;
            }) => ({
              googleEventId: d.googleEventId,
              googleIntegrationId: typeof d.googleIntegrationId === 'string' ? d.googleIntegrationId : undefined,
              taskIds: Array.isArray(d.taskIds)
                ? d.taskIds.filter((t: unknown): t is string => typeof t === 'string')
                : [],
              mode: d.mode === 'leave' ? 'leave' : ('defer' as 'defer' | 'leave'),
              durationMinutes: typeof d.durationMinutes === 'number' ? d.durationMinutes : undefined,
              priorityDurationMinutes:
                typeof d.priorityDurationMinutes === 'number' ? d.priorityDurationMinutes : undefined,
            })
          )
      : [];
    // Stale prep blocks the user dismissed: the prep record is deleted (its past
    // meeting is over, so there is nothing left to prepare for).
    const dismissEventIds: string[] = Array.isArray(body?.dismiss)
      ? body.dismiss.filter((id: unknown): id is string => typeof id === 'string')
      : [];
    // Missing-ritual additions the user accepted: each creates a fresh ritual
    // event (routed to the ritual calendar, opaque) + record.
    const additions: ProposedBlock[] = Array.isArray(body?.additions)
      ? body.additions.filter((a: unknown): a is ProposedBlock => !!a && typeof a === 'object')
      : [];
    // Conflicted break blocks the user accepted deleting: the calendar event AND
    // its ritual record are removed (a break has no fixed home to move to).
    const deletions: Array<{ googleEventId: string; googleIntegrationId?: string }> = Array.isArray(
      body?.deletions
    )
      ? body.deletions.filter(
          (d: unknown): d is { googleEventId: string; googleIntegrationId?: string } =>
            !!d && typeof d === 'object' && typeof (d as { googleEventId?: unknown }).googleEventId === 'string'
        )
      : [];
    // Bare calendar events (source 'calendar') the user left not-done: adopt each
    // into a local record so the replan step can re-slot it. Trust only the shape;
    // the record type is chosen server-side from whether a gid is present.
    const adoptInputs: ReviewAdoptInput[] = Array.isArray(body?.adopt)
      ? body.adopt.filter(
          (a: unknown): a is ReviewAdoptInput =>
            !!a &&
            typeof a === 'object' &&
            typeof (a as { googleEventId?: unknown }).googleEventId === 'string' &&
            typeof (a as { title?: unknown }).title === 'string' &&
            typeof (a as { date?: unknown }).date === 'string' &&
            typeof (a as { start?: unknown }).start === 'string' &&
            typeof (a as { durationMinutes?: unknown }).durationMinutes === 'number'
        )
      : [];
    if (
      moves.length === 0 &&
      doneEventIds.length === 0 &&
      notDoneEventIds.length === 0 &&
      asanaCompletions.length === 0 &&
      adoptInputs.length === 0 &&
      deferInputs.length === 0 &&
      leaveEventIds.length === 0 &&
      displaceInputs.length === 0 &&
      dismissEventIds.length === 0 &&
      additions.length === 0 &&
      deletions.length === 0
    ) {
      return NextResponse.json(
        { error: 'No moves, done markings, dismissals, additions or deletions provided' },
        { status: 400 }
      );
    }

    const enabledGoogle = await getEnabledGoogleIntegrations();
    const defaultGoogle = enabledGoogle[0] ?? null;

    // Resolve + validate each Google integration at most once per request.
    const googleCache = new Map<
      string,
      { integration: GoogleIntegration; credentials: GoogleCalendarCredentials }
    >();
    const resolveGoogle = async (id?: string) => {
      const target = id ? await getGoogleIntegrationById(id) : defaultGoogle;
      const integration = target && target.credentials ? target : defaultGoogle;
      if (!integration || !integration.credentials) return null;
      const cached = googleCache.get(integration.id);
      if (cached) return cached;
      const credentials = await ensureValidCredentials(integration);
      const resolved = { integration, credentials };
      googleCache.set(integration.id, resolved);
      return resolved;
    };

    const [adHocTasks, prepBlocks, ritualBlocks, scheduledAsana] = await Promise.all([
      getAdHocTasks(),
      getPrepBlocks(),
      getRitualBlocks(),
      getScheduledAsanaTasks(),
    ]);
    const results: MoveResult[] = [];

    // --- Done markings (no calendar mutation; the event stays as history) ---
    const doneResults: DoneResult[] = [];
    for (const googleEventId of doneEventIds) {
      try {
        const prep = prepBlocks.find(p => p.googleEventId === googleEventId);
        if (prep) {
          await updatePrepBlock(prep.id, { done: true });
        } else {
          const adhoc = adHocTasks.find(t => t.googleEventId === googleEventId);
          if (adhoc) {
            await updateAdHocTask(adhoc.id, { completed: true });
          } else {
            // Asana-backed (or unknown): a planning-only override.
            await setBlockDoneOverride(googleEventId);
          }
        }
        doneResults.push({ googleEventId, success: true });
      } catch (err) {
        console.error(`[Replan Confirm] Failed to mark done ${googleEventId}:`, err);
        doneResults.push({
          googleEventId,
          success: false,
          error: err instanceof Error ? err.message : 'Failed to mark done',
        });
      }
    }

    // --- Not-done markings: reverse of done[] so the block re-reads as missed ---
    const notDoneResults: DoneResult[] = [];
    for (const googleEventId of notDoneEventIds) {
      try {
        const prep = prepBlocks.find(p => p.googleEventId === googleEventId);
        if (prep) {
          await updatePrepBlock(prep.id, { done: false });
        } else {
          const adhoc = adHocTasks.find(t => t.googleEventId === googleEventId);
          if (adhoc) {
            await updateAdHocTask(adhoc.id, { completed: false });
          }
        }
        // Always clear any planning override (Asana-backed or otherwise).
        await removeBlockDoneOverride(googleEventId);
        notDoneResults.push({ googleEventId, success: true });
      } catch (err) {
        console.error(`[Replan Confirm] Failed to mark not done ${googleEventId}:`, err);
        notDoneResults.push({
          googleEventId,
          success: false,
          error: err instanceof Error ? err.message : 'Failed to mark not done',
        });
      }
    }

    // --- Adoptions: turn a not-done bare calendar event into a local record ---
    // Asana-matched → a scheduled Asana block (the replan re-slots it and later
    // completion flows through Asana); otherwise → an ad-hoc task. Both link the
    // existing Google event, so nothing new lands on the calendar.
    const adoptResults: AdoptResult[] = [];
    for (const a of adoptInputs) {
      try {
        if (a.gid && a.integrationId) {
          await scheduleAsanaTask(
            a.gid,
            a.integrationId,
            a.date,
            a.start,
            a.durationMinutes,
            a.googleEventId,
            a.googleIntegrationId,
            a.title
          );
        } else {
          await addAdHocTask({
            title: a.title,
            completed: false,
            priority: 'medium',
            taskType: 'focus',
            dueDate: a.date,
            dueTime: a.start,
            duration: a.durationMinutes,
            googleEventId: a.googleEventId,
            googleIntegrationId: a.googleIntegrationId,
          });
        }
        adoptResults.push({ googleEventId: a.googleEventId, success: true });
      } catch (err) {
        console.error(`[Replan Confirm] Failed to adopt calendar event ${a.googleEventId}:`, err);
        adoptResults.push({
          googleEventId: a.googleEventId,
          success: false,
          error: err instanceof Error ? err.message : 'Failed to adopt calendar event',
        });
      }
    }

    // --- Asana completions: mark selected tasks complete in Asana directly ---
    // Cache + refresh each Asana integration's credentials at most once per run.
    const asanaResults: AsanaCompleteResult[] = [];
    const asanaCredCache = new Map<string, string>(); // integrationId -> accessToken
    for (const { gid, integrationId } of asanaCompletions) {
      try {
        let accessToken = asanaCredCache.get(integrationId);
        if (!accessToken) {
          const integration = (await getIntegrationById(integrationId)) as AsanaIntegration | null;
          if (!integration || integration.type !== 'asana' || !integration.credentials) {
            throw new Error('Asana integration not found or not authenticated');
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
          accessToken = credentials.accessToken;
          asanaCredCache.set(integrationId, accessToken);
        }
        await completeTask(accessToken, gid, true);
        asanaResults.push({ gid, success: true });
      } catch (err) {
        console.error(`[Replan Confirm] Failed to complete Asana task ${gid}:`, err);
        asanaResults.push({
          gid,
          success: false,
          error: err instanceof Error ? err.message : 'Failed to complete Asana task',
        });
      }
    }

    // --- Deferrals: park each block's tasks until next Monday (server-computed,
    // never trusting a client date) and clear its planning override ---
    const deferResults: DeferResult[] = [];
    if (deferInputs.length > 0) {
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      const until = format(addDays(weekStart, 7), 'yyyy-MM-dd'); // next Monday
      for (const d of deferInputs) {
        try {
          if (d.taskIds.length > 0) {
            await setTaskDeferrals(d.taskIds.map(taskId => ({ taskId, until })));
          }
          if (d.googleEventId) await removeBlockDoneOverride(d.googleEventId);
          deferResults.push({ taskIds: d.taskIds, googleEventId: d.googleEventId, success: true });
        } catch (err) {
          console.error(`[Replan Confirm] Failed to defer ${d.googleEventId ?? d.taskIds.join(',')}:`, err);
          deferResults.push({
            taskIds: d.taskIds,
            googleEventId: d.googleEventId,
            success: false,
            error: err instanceof Error ? err.message : 'Failed to defer',
          });
        }
      }
    }

    // --- Leave unscheduled: just clear any stale planning override ---
    for (const googleEventId of leaveEventIds) {
      try {
        await removeBlockDoneOverride(googleEventId);
        deferResults.push({ taskIds: [], googleEventId, success: true });
      } catch (err) {
        console.error(`[Replan Confirm] Failed to leave-unscheduled ${googleEventId}:`, err);
        deferResults.push({
          taskIds: [],
          googleEventId,
          success: false,
          error: err instanceof Error ? err.message : 'Failed to leave unscheduled',
        });
      }
    }

    // --- Dismissals: delete the (stale) prep record and clean up after it ---
    for (const googleEventId of dismissEventIds) {
      try {
        const prep = prepBlocks.find(p => p.googleEventId === googleEventId);
        if (prep) await deletePrepBlock(prep.id);
        await removeGoogleEventAttribution(googleEventId);
        await removeBlockDoneOverride(googleEventId);
        doneResults.push({ googleEventId, success: true });
      } catch (err) {
        console.error(`[Replan Confirm] Failed to dismiss ${googleEventId}:`, err);
        doneResults.push({
          googleEventId,
          success: false,
          error: err instanceof Error ? err.message : 'Failed to dismiss',
        });
      }
    }

    // --- Deletions: remove conflicted break events + their tracking records ---
    for (const del of deletions) {
      try {
        const record = ritualBlocks.find(r => r.googleEventId === del.googleEventId);
        const resolved = await resolveGoogle(del.googleIntegrationId ?? record?.googleIntegrationId);
        if (resolved) {
          try {
            await deleteCalendarEvent(
              resolved.credentials,
              resolved.integration.clientId,
              resolved.integration.clientSecret,
              del.googleEventId
            );
          } catch (err) {
            // Already-gone events still count as a successful deletion.
            if (!isEventGoneError(err)) throw err;
          }
        }
        if (record) await deleteRitualBlock(record.id);
        await removeGoogleEventAttribution(del.googleEventId);
        await removeBlockDoneOverride(del.googleEventId);
        doneResults.push({ googleEventId: del.googleEventId, success: true });
      } catch (err) {
        console.error(`[Replan Confirm] Failed to delete break ${del.googleEventId}:`, err);
        doneResults.push({
          googleEventId: del.googleEventId,
          success: false,
          error: err instanceof Error ? err.message : 'Failed to delete break',
        });
      }
    }

    // --- Displacements: free tomorrow's slot for a "prioritise tomorrow" block ---
    // Delete the victim's calendar event, clear its stored schedule (so the slot
    // is genuinely free and the task returns to the pool), then either defer its
    // tasks to next week or leave them to be re-planned. The prioritised block
    // itself arrives as a normal move into the freed slot (handled below).
    const displaceResults: DisplaceResult[] = [];
    if (displaceInputs.length > 0) {
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      const until = format(addDays(weekStart, 7), 'yyyy-MM-dd'); // next Monday
      for (const d of displaceInputs) {
        try {
          // Reject a victim too short to hold the prioritised block, so the freed
          // slot can never overlap what follows it. The paired move is skipped
          // client-side; this is the server-side backstop.
          if (
            d.durationMinutes !== undefined &&
            d.priorityDurationMinutes !== undefined &&
            d.durationMinutes < d.priorityDurationMinutes
          ) {
            displaceResults.push({
              googleEventId: d.googleEventId,
              success: false,
              error: `Block is too short (${d.durationMinutes}m) to hold the prioritised ${d.priorityDurationMinutes}m block`,
            });
            continue;
          }
          const resolved = await resolveGoogle(d.googleIntegrationId);
          if (resolved) {
            try {
              await deleteCalendarEvent(
                resolved.credentials,
                resolved.integration.clientId,
                resolved.integration.clientSecret,
                d.googleEventId
              );
            } catch (err) {
              // Already-gone events still count as a successful displacement.
              if (!isEventGoneError(err)) throw err;
            }
          }
          // Clear the stored schedule for whichever store owns the victim event.
          for (const s of scheduledAsana.filter(s => s.googleEventId === d.googleEventId)) {
            await unscheduleAsanaTask(s.id);
          }
          const adhoc = adHocTasks.find(t => t.googleEventId === d.googleEventId);
          if (adhoc) {
            await updateAdHocTask(adhoc.id, { googleEventId: undefined, dueDate: undefined, dueTime: undefined });
          }
          // Defer the freed work to next week, or leave it in the pool ('leave').
          if (d.mode === 'defer' && d.taskIds.length > 0) {
            await setTaskDeferrals(d.taskIds.map(taskId => ({ taskId, until })));
          }
          await removeBlockDoneOverride(d.googleEventId);
          await removeGoogleEventAttribution(d.googleEventId);
          displaceResults.push({ googleEventId: d.googleEventId, success: true });
        } catch (err) {
          console.error(`[Replan Confirm] Failed to displace ${d.googleEventId}:`, err);
          displaceResults.push({
            googleEventId: d.googleEventId,
            success: false,
            error: err instanceof Error ? err.message : 'Failed to displace block',
          });
        }
      }
    }

    for (const move of moves) {
      try {
        const resolved = await resolveGoogle(move.googleIntegrationId);
        if (!resolved) {
          results.push({
            googleEventId: move.googleEventId,
            success: false,
            error: 'No authenticated Google integration available',
          });
          continue;
        }

        const { start, end } = toStartEnd(move.date, move.start, move.durationMinutes);
        // Patch only the time — passing no title/description/color keeps the
        // event's existing content and transparency intact.
        await updateCalendarEvent(
          resolved.credentials,
          resolved.integration.clientId,
          resolved.integration.clientSecret,
          move.googleEventId,
          start,
          end
        );

        // Update the stored schedule for whichever store owns this event.
        const updated = await updateScheduledAsanaTasksByGoogleEvent(move.googleEventId, {
          scheduledDate: move.date,
          scheduledTime: move.start,
        });
        if (updated === 0) {
          const adhoc = adHocTasks.find(t => t.googleEventId === move.googleEventId);
          if (adhoc) {
            await updateAdHocTask(adhoc.id, { dueDate: move.date, dueTime: move.start });
          } else {
            const prep = prepBlocks.find(p => p.googleEventId === move.googleEventId);
            if (prep) {
              await updatePrepBlock(prep.id, {
                date: move.date,
                start: move.start,
                durationMinutes: move.durationMinutes,
              });
            }
          }
        }

        results.push({ googleEventId: move.googleEventId, success: true });
      } catch (err) {
        console.error(`[Replan Confirm] Failed to move event ${move.googleEventId}:`, err);
        results.push({
          googleEventId: move.googleEventId,
          success: false,
          error: err instanceof Error ? err.message : 'Failed to move event',
        });
      }
    }

    // --- Additions: create each missing ritual on the ritual calendar ---
    // Ritual events route to the configured ritual Google integration (else the
    // default), opaque, via the shared creator reused by the weekly-plan confirm.
    const additionResults: AdditionResult[] = [];
    if (additions.length > 0) {
      const config = await getWorkflowConfig();
      for (const block of additions) {
        try {
          const ritualId = ritualIntegrationIdForBlock(config.scheduling, block.title ?? '');
          const resolved = await resolveGoogle(ritualId);
          if (!resolved) {
            additionResults.push({
              id: block.id,
              success: false,
              error: 'No authenticated Google integration available',
            });
            continue;
          }
          const googleEventId = await createRitualEvent(resolved, block);
          additionResults.push({ id: block.id, success: true, googleEventId });
        } catch (err) {
          console.error(`[Replan Confirm] Failed to add ritual ${block.id}:`, err);
          additionResults.push({
            id: block.id,
            success: false,
            error: err instanceof Error ? err.message : 'Failed to add ritual',
          });
        }
      }
    }

    return NextResponse.json({ results, doneResults, notDoneResults, asanaResults, adoptResults, deferResults, displaceResults, additionResults });
  } catch (error) {
    console.error('Error confirming mid-week replan:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to confirm replan' },
      { status: 500 }
    );
  }
}
