import { NextRequest, NextResponse } from 'next/server';

import { createCalendarEvent, ensureValidCredentials } from '@/lib/google-calendar';
import {
  getEnabledAsanaIntegrations,
  getEnabledGoogleIntegrations,
  getGoogleIntegrationById,
} from '@/lib/integration-storage';
import {
  scheduleAsanaTask,
  updateAdHocTask,
  setGoogleEventAttribution,
  addPrepBlock,
  addRitualBlock,
} from '@/lib/user-data-storage';
import { getWorkflowConfig } from '@/lib/workflow-config-storage';
import type { GoogleCalendarCredentials, GoogleIntegration } from '@/types';
import type { ProposedBlock } from '@/lib/scheduling/types';
import { eventTitleForBlock } from '@/lib/scheduling/event-titles';

// An accepted proposal is a ProposedBlock, optionally with a user-edited date /
// start time.
type AcceptedProposal = ProposedBlock;

interface ConfirmResult {
  id: string;
  success: boolean;
  googleEventId?: string;
  error?: string;
}

// Build local start/end Dates from a yyyy-MM-dd date + HH:mm start + duration.
function toStartEnd(date: string, start: string, durationMinutes: number): { start: Date; end: Date } {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, m] = start.split(':').map(Number);
  const startDate = new Date(y, mo - 1, d, h, m, 0, 0);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
  return { start: startDate, end: endDate };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const proposals: AcceptedProposal[] = Array.isArray(body?.proposals) ? body.proposals : [];
    if (proposals.length === 0) {
      return NextResponse.json({ error: 'No proposals provided' }, { status: 400 });
    }

    // Pick the DEFAULT Google integration to create events on. The app's default
    // event-creation calendar is the (first) enabled Google integration's
    // primary calendar; the drag-drop flow uses the single integration directly
    // and only prompts when several exist. For batch auto-scheduling we take the
    // first enabled integration unless the caller specifies one.
    let defaultGoogle: GoogleIntegration | null = null;
    if (typeof body?.googleIntegrationId === 'string') {
      defaultGoogle = await getGoogleIntegrationById(body.googleIntegrationId);
    }
    if (!defaultGoogle) {
      const enabled = await getEnabledGoogleIntegrations();
      defaultGoogle = enabled[0] ?? null;
    }
    if (!defaultGoogle || !defaultGoogle.credentials) {
      return NextResponse.json(
        { error: 'No authenticated Google integration available to create events' },
        { status: 400 }
      );
    }

    // Per-Asana-integration event routing: a task from an Asana integration with
    // `eventGoogleIntegrationId` set has its event created on that Google
    // integration's primary calendar, with the integration's `eventTransparency`
    // (e.g. OM tasks → OM Google calendar, marked Free). Everything else uses the
    // default integration and opaque (busy) availability.
    // Ritual events (Lunch / Emails) go on the configured ritual Google
    // integration (e.g. the OM work calendar) when set, else the default. They
    // stay opaque/busy so lunch blocks bookings.
    const config = await getWorkflowConfig();
    const ritualGoogleIntegrationId = config.scheduling.ritualGoogleIntegrationId;

    const asanaIntegrations = await getEnabledAsanaIntegrations();
    const asanaRouting = new Map(
      asanaIntegrations
        .filter(a => a.eventGoogleIntegrationId)
        .map(a => [
          a.id,
          {
            googleIntegrationId: a.eventGoogleIntegrationId!,
            transparency: a.eventTransparency ?? 'opaque',
          },
        ])
    );

    // Cache resolved Google integration + validated credentials, keyed by id, so
    // each integration is loaded and token-refreshed at most once per request.
    const googleCache = new Map<
      string,
      { integration: GoogleIntegration; credentials: GoogleCalendarCredentials }
    >();
    const resolveGoogle = async (
      id: string
    ): Promise<{ integration: GoogleIntegration; credentials: GoogleCalendarCredentials } | null> => {
      const cached = googleCache.get(id);
      if (cached) return cached;
      const integration =
        id === defaultGoogle!.id ? defaultGoogle! : await getGoogleIntegrationById(id);
      if (!integration || !integration.credentials) return null;
      const credentials = await ensureValidCredentials(integration);
      const resolved = { integration, credentials };
      googleCache.set(id, resolved);
      return resolved;
    };
    // Seed the cache with the (already validated) default.
    googleCache.set(defaultGoogle.id, {
      integration: defaultGoogle,
      credentials: await ensureValidCredentials(defaultGoogle),
    });

    // Decide which Google integration + transparency a proposal's event should
    // use. A block routes to a special calendar only when EVERY task on it comes
    // from the SAME Asana integration that declares an event-routing override;
    // prep/reserved/ad-hoc/mixed blocks fall back to the default (opaque).
    const routeProposal = (
      proposal: ProposedBlock
    ): { googleIntegrationId: string; transparency: 'opaque' | 'transparent' } => {
      const fallback = { googleIntegrationId: defaultGoogle!.id, transparency: 'opaque' as const };
      if (proposal.kind === 'ritual') {
        return ritualGoogleIntegrationId
          ? { googleIntegrationId: ritualGoogleIntegrationId, transparency: 'opaque' as const }
          : fallback;
      }
      if (proposal.kind === 'prep') return fallback;
      const tasks = Array.isArray(proposal.tasks)
        ? proposal.tasks
        : proposal.task
          ? [proposal.task]
          : [];
      if (tasks.length === 0) return fallback;
      const first = tasks[0].integrationId;
      if (!first || !tasks.every(t => t.integrationId === first)) return fallback;
      const routing = asanaRouting.get(first);
      if (!routing) return fallback;
      return { googleIntegrationId: routing.googleIntegrationId, transparency: routing.transparency };
    };

    const results: ConfirmResult[] = [];

    for (const proposal of proposals) {
      try {
        const { start, end } = toStartEnd(proposal.date, proposal.start, proposal.durationMinutes);
        const isPrep = proposal.kind === 'prep';
        const isRitual = proposal.kind === 'ritual';
        // A grouped block (e.g. Engagement / Outreach) carries a `tasks` list
        // instead of a single `task`: one container event titled with the
        // category, its agenda listed in the description.
        const isGrouped = Array.isArray(proposal.tasks);
        const isReserved = !isPrep && !isRitual && !isGrouped && !proposal.task;
        // All app-created events are titled via the shared module (emoji prefix
        // by category / prep / ritual, one source of truth).
        const title = eventTitleForBlock(proposal);

        // Grouped blocks list their assigned tasks as a bulleted agenda beneath
        // the reason; everything else just uses the reason as the description.
        const description =
          isGrouped && proposal.tasks!.length > 0
            ? `${proposal.reason}\n\n${proposal.tasks!.map(t => `• ${t.title}`).join('\n')}`
            : proposal.reason;

        // Route this proposal to its target Google integration + availability.
        const route = routeProposal(proposal);
        const resolved = (await resolveGoogle(route.googleIntegrationId)) ?? googleCache.get(defaultGoogle.id)!;
        const googleIntegration = resolved.integration;

        const event = await createCalendarEvent(
          resolved.credentials,
          googleIntegration.clientId,
          googleIntegration.clientSecret,
          title,
          start,
          end,
          description,
          'default',
          'primary',
          { transparency: route.transparency }
        );

        if (isPrep) {
          // Record the prep block so the planner can dedupe against it, reconcile
          // it if the user deletes the event, and reason about it during replan.
          if (proposal.meeting) {
            await addPrepBlock({
              googleEventId: event.id,
              googleIntegrationId: googleIntegration.id,
              meetingEventId: proposal.meeting.eventId,
              meetingTitle: proposal.meeting.title,
              meetingStart: proposal.meeting.meetingStart,
              date: proposal.date,
              start: proposal.start,
              durationMinutes: proposal.durationMinutes,
            });
          }
        } else if (isRitual) {
          // Record the ritual block so the planner can dedupe against it, reconcile
          // it if the user deletes the event, reset it, and re-slot it in replan.
          await addRitualBlock({
            googleEventId: event.id,
            googleIntegrationId: googleIntegration.id,
            title,
            date: proposal.date,
            start: proposal.start,
            durationMinutes: proposal.durationMinutes,
          });
        } else if (isGrouped) {
          // Record each listed task as scheduled to the shared container event, so
          // they show as scheduled and drop out of future candidate pools.
          for (const t of proposal.tasks!) {
            if (t.gid) {
              await scheduleAsanaTask(
                t.gid,
                t.integrationId,
                proposal.date,
                proposal.start,
                proposal.durationMinutes,
                event.id,
                googleIntegration.id
              );
              if (t.integrationId) {
                await setGoogleEventAttribution(event.id, googleIntegration.id, t.integrationId);
              }
            } else if (t.adhocId) {
              await updateAdHocTask(t.adhocId, {
                dueDate: proposal.date,
                dueTime: proposal.start,
                duration: proposal.durationMinutes,
                googleEventId: event.id,
                googleIntegrationId: googleIntegration.id,
              });
            }
          }
        } else if (!isReserved && proposal.task) {
          const { gid, adhocId, integrationId } = proposal.task;
          if (gid) {
            await scheduleAsanaTask(
              gid,
              integrationId,
              proposal.date,
              proposal.start,
              proposal.durationMinutes,
              event.id,
              googleIntegration.id
            );
            // Attribute the Google event to the task's Asana workspace so
            // client-time tracking counts it.
            if (integrationId) {
              await setGoogleEventAttribution(event.id, googleIntegration.id, integrationId);
            }
          } else if (adhocId) {
            await updateAdHocTask(adhocId, {
              dueDate: proposal.date,
              dueTime: proposal.start,
              duration: proposal.durationMinutes,
              googleEventId: event.id,
              googleIntegrationId: googleIntegration.id,
            });
          }
        }

        results.push({ id: proposal.id, success: true, googleEventId: event.id });
      } catch (err) {
        console.error(`[Scheduling Confirm] Failed to apply proposal ${proposal.id}:`, err);
        results.push({
          id: proposal.id,
          success: false,
          error: err instanceof Error ? err.message : 'Failed to create event',
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Error confirming weekly plan:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to confirm plan' },
      { status: 500 }
    );
  }
}
