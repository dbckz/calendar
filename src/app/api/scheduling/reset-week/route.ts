import { NextRequest, NextResponse } from 'next/server';
import { addDays, format, startOfWeek } from 'date-fns';

import { deleteCalendarEvent, ensureValidCredentials } from '@/lib/google-calendar';
import {
  getEnabledGoogleIntegrations,
  getGoogleIntegrationById,
} from '@/lib/integration-storage';
import {
  getScheduledAsanaTasks,
  getAdHocTasks,
  getPrepBlocks,
  unscheduleAsanaTask,
  updateAdHocTask,
  deletePrepBlock,
  removeGoogleEventAttribution,
  removeBlockDoneOverride,
} from '@/lib/user-data-storage';
import { splitWeekResetEvents, type ResetEvent } from '@/lib/scheduling/reset';
import type { GoogleCalendarCredentials, GoogleIntegration } from '@/types';

// Absolute ms for a local yyyy-MM-dd + HH:mm.
function toMs(date: string, time: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, m] = time.split(':').map(Number);
  return new Date(y, mo - 1, d, h, m, 0, 0).getTime();
}

// Treat a 404/410 from Google as "already gone" — the reset still succeeds.
function isAlreadyGone(err: unknown): boolean {
  const status =
    (err as { code?: number; status?: number; response?: { status?: number } })?.code ??
    (err as { status?: number })?.status ??
    (err as { response?: { status?: number } })?.response?.status;
  return status === 404 || status === 410;
}

// POST { weekStart?: string }
// Start this week's planning from scratch: delete the app-created blocks that are
// still in the future from the calendar (past blocks are left as history), and
// clear ALL this-week records regardless of past/future. Meetings and the
// remembered meeting-prep decisions are untouched.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const now = new Date();
    const weekStart = typeof body?.weekStart === 'string'
      ? startOfWeek(new Date(`${body.weekStart}T00:00:00`), { weekStartsOn: 1 })
      : startOfWeek(now, { weekStartsOn: 1 });
    const weekStartStr = format(weekStart, 'yyyy-MM-dd');
    const weekEndStr = format(addDays(weekStart, 6), 'yyyy-MM-dd');
    const inWeek = (d?: string): boolean => !!d && d >= weekStartStr && d <= weekEndStr;

    const [scheduledAsana, adHocTasks, prepBlocks] = await Promise.all([
      getScheduledAsanaTasks(),
      getAdHocTasks(),
      getPrepBlocks(),
    ]);

    // --- Enumerate this week's app-created blocks (one ResetEvent per event) ---
    const events: ResetEvent[] = [];
    const scheduledAsanaInWeek = scheduledAsana.filter(s => s.googleEventId && inWeek(s.scheduledDate));
    for (const s of scheduledAsanaInWeek) {
      events.push({
        googleEventId: s.googleEventId!,
        googleIntegrationId: s.googleIntegrationId,
        startMs: toMs(s.scheduledDate, s.scheduledTime),
      });
    }
    const adHocInWeek = adHocTasks.filter(t => t.googleEventId && t.dueTime && inWeek(t.dueDate));
    for (const t of adHocInWeek) {
      events.push({
        googleEventId: t.googleEventId!,
        googleIntegrationId: t.googleIntegrationId,
        startMs: toMs(t.dueDate!, t.dueTime!),
      });
    }
    const prepInWeek = prepBlocks.filter(p => inWeek(p.date));
    for (const p of prepInWeek) {
      events.push({
        googleEventId: p.googleEventId,
        googleIntegrationId: p.googleIntegrationId,
        startMs: toMs(p.date, p.start),
      });
    }

    const { toDelete } = splitWeekResetEvents(events, now.getTime());

    // --- Delete the future events from the calendar ---
    const enabledGoogle = await getEnabledGoogleIntegrations();
    const defaultGoogle = enabledGoogle[0] ?? null;
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

    let eventsDeleted = 0;
    for (const e of toDelete) {
      try {
        const resolved = await resolveGoogle(e.googleIntegrationId);
        if (!resolved) {
          console.error(`[Reset Week] No Google integration to delete event ${e.googleEventId}`);
          continue;
        }
        await deleteCalendarEvent(
          resolved.credentials,
          resolved.integration.clientId,
          resolved.integration.clientSecret,
          e.googleEventId
        );
        eventsDeleted += 1;
      } catch (err) {
        if (isAlreadyGone(err)) {
          eventsDeleted += 1; // already gone counts as handled
          continue;
        }
        console.error(`[Reset Week] Failed to delete event ${e.googleEventId}:`, err);
      }
    }

    // --- Clear ALL this-week records (past + future) ---
    let recordsCleared = 0;
    const removedEventIds = new Set<string>();

    for (const s of scheduledAsanaInWeek) {
      await unscheduleAsanaTask(s.id);
      if (s.googleEventId) removedEventIds.add(s.googleEventId);
      recordsCleared += 1;
    }
    for (const t of adHocInWeek) {
      // Keep the task (and its completed flag); just unschedule it.
      await updateAdHocTask(t.id, { googleEventId: undefined, dueDate: undefined, dueTime: undefined });
      if (t.googleEventId) removedEventIds.add(t.googleEventId);
      recordsCleared += 1;
    }
    for (const p of prepInWeek) {
      await deletePrepBlock(p.id);
      removedEventIds.add(p.googleEventId);
      recordsCleared += 1;
    }

    // Attributions + planning done-overrides for the removed events are now stale.
    for (const eventId of removedEventIds) {
      await removeGoogleEventAttribution(eventId);
      await removeBlockDoneOverride(eventId);
    }

    return NextResponse.json({ eventsDeleted, recordsCleared });
  } catch (error) {
    console.error('Error resetting week:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reset week' },
      { status: 500 }
    );
  }
}
