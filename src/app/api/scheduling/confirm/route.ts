import { NextRequest, NextResponse } from 'next/server';

import { createCalendarEvent, ensureValidCredentials } from '@/lib/google-calendar';
import { getEnabledGoogleIntegrations, getGoogleIntegrationById } from '@/lib/integration-storage';
import {
  scheduleAsanaTask,
  updateAdHocTask,
  setGoogleEventAttribution,
} from '@/lib/user-data-storage';
import type { GoogleIntegration } from '@/types';
import type { ProposedBlock } from '@/lib/scheduling/types';

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

    // Pick the Google integration to create events on. The app's default
    // event-creation calendar is the (first) enabled Google integration's
    // primary calendar; the drag-drop flow uses the single integration directly
    // and only prompts when several exist. For batch auto-scheduling we take the
    // first enabled integration unless the caller specifies one.
    let googleIntegration: GoogleIntegration | null = null;
    if (typeof body?.googleIntegrationId === 'string') {
      googleIntegration = await getGoogleIntegrationById(body.googleIntegrationId);
    }
    if (!googleIntegration) {
      const enabled = await getEnabledGoogleIntegrations();
      googleIntegration = enabled[0] ?? null;
    }
    if (!googleIntegration || !googleIntegration.credentials) {
      return NextResponse.json(
        { error: 'No authenticated Google integration available to create events' },
        { status: 400 }
      );
    }

    const credentials = await ensureValidCredentials(googleIntegration);
    const results: ConfirmResult[] = [];

    for (const proposal of proposals) {
      try {
        const { start, end } = toStartEnd(proposal.date, proposal.start, proposal.durationMinutes);
        const isPrep = proposal.kind === 'prep';
        // A grouped block (e.g. Engagement / Outreach) carries a `tasks` list
        // instead of a single `task`: one container event titled with the
        // category, its agenda listed in the description.
        const isGrouped = Array.isArray(proposal.tasks);
        const isReserved = !isPrep && !isGrouped && !proposal.task;
        const title = isPrep
          ? `Prep: ${proposal.meeting?.title ?? proposal.category}`
          : isGrouped
            ? proposal.category
            : isReserved
              ? `${proposal.category} block`
              : proposal.task!.title;

        // Grouped blocks list their assigned tasks as a bulleted agenda beneath
        // the reason; everything else just uses the reason as the description.
        const description =
          isGrouped && proposal.tasks!.length > 0
            ? `${proposal.reason}\n\n${proposal.tasks!.map(t => `• ${t.title}`).join('\n')}`
            : proposal.reason;

        const event = await createCalendarEvent(
          credentials,
          googleIntegration.clientId,
          googleIntegration.clientSecret,
          title,
          start,
          end,
          description,
          'default',
          'primary'
        );

        if (isGrouped) {
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
