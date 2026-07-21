import { NextRequest, NextResponse } from 'next/server';

import { ensureValidCredentials, updateCalendarEvent } from '@/lib/google-calendar';
import {
  getEnabledGoogleIntegrations,
  getGoogleIntegrationById,
} from '@/lib/integration-storage';
import {
  getAdHocTasks,
  updateAdHocTask,
  updateScheduledAsanaTasksByGoogleEvent,
} from '@/lib/user-data-storage';
import type { GoogleCalendarCredentials, GoogleIntegration } from '@/types';

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
    const moves: MoveInput[] = Array.isArray(body?.moves) ? body.moves : [];
    if (moves.length === 0) {
      return NextResponse.json({ error: 'No moves provided' }, { status: 400 });
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

    const adHocTasks = await getAdHocTasks();
    const results: MoveResult[] = [];

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

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Error confirming mid-week replan:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to confirm replan' },
      { status: 500 }
    );
  }
}
