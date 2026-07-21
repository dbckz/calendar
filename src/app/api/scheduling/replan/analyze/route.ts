import { NextRequest, NextResponse } from 'next/server';

import { classifyBlockCategory } from '@/lib/capacity';
import { adHocTypeSignals, gatherWeekContext } from '@/lib/scheduling/gather';
import { eventsToBusyIntervals } from '@/lib/scheduling/free-busy';
import { planReplan, type ReplanBlock } from '@/lib/scheduling/replan';
import {
  getScheduledAsanaTasks,
  getAdHocTasks,
  getCustomTaskTypes,
  getPrepBlocks,
  getBlockDoneOverrides,
} from '@/lib/user-data-storage';
import type { ScheduledAsanaTask } from '@/types';

const MS_PER_MINUTE = 60 * 1000;

// Analyze this week's app-created blocks and propose moves for the ones that
// have been missed (past + not done) or now conflict with a meeting. Pure logic
// lives in planReplan(); this route just assembles its inputs from the week
// context + stored schedule.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const weekStartParam = typeof body?.weekStart === 'string' ? body.weekStart : undefined;

    const ctx = await gatherWeekContext(weekStartParam);
    const [scheduledAsana, adHocTasks, customTypes, prepBlocks, doneOverrides] = await Promise.all([
      getScheduledAsanaTasks(),
      getAdHocTasks(),
      getCustomTaskTypes(),
      getPrepBlocks(),
      getBlockDoneOverrides(),
    ]);

    const inWeek = (d?: string) => !!d && d >= ctx.weekStartStr && d <= ctx.weekEndStr;

    // Look up each app block's actual interval from the matched calendar event
    // where possible; fall back to the stored schedule if the event isn't in the
    // fetched week (e.g. moved out of range) so we can still reason about it.
    const eventById = new Map(ctx.weekEvents.map(e => [e.id, e]));
    const intervalFor = (eventId: string, date: string, time: string, duration: number) => {
      const ev = eventById.get(eventId);
      if (ev && !ev.allDay) {
        const s = new Date(ev.startTime).getTime();
        const e = new Date(ev.endTime).getTime();
        if (!Number.isNaN(s) && !Number.isNaN(e) && e > s) return { startMs: s, endMs: e };
      }
      const [y, mo, d] = date.split('-').map(Number);
      const [h, m] = time.split(':').map(Number);
      const startMs = new Date(y, mo - 1, d, h, m, 0, 0).getTime();
      return { startMs, endMs: startMs + duration * MS_PER_MINUTE };
    };

    // Incomplete Asana tasks (from the shared fetch): drives title + done status.
    // A scheduled gid absent from this set is complete.
    const incompleteByGid = new Map(ctx.asanaCandidates.map(c => [c.task.gid, c.task]));
    const asanaTypeByGid = new Map(ctx.asanaCandidates.map(c => [c.task.gid, c.typeValue]));

    const blocks: ReplanBlock[] = [];
    const appEventIds = new Set<string>();

    // Group scheduled Asana tasks by their Google event: a grouped block records
    // several tasks against one event.
    const asanaGroups = new Map<string, ScheduledAsanaTask[]>();
    for (const s of scheduledAsana) {
      if (!s.googleEventId || !inWeek(s.scheduledDate)) continue;
      const list = asanaGroups.get(s.googleEventId) ?? [];
      list.push(s);
      asanaGroups.set(s.googleEventId, list);
    }

    for (const [eventId, entries] of asanaGroups) {
      appEventIds.add(eventId);
      const first = entries[0];
      const titles = entries.map(e => incompleteByGid.get(e.asanaTaskId)?.name ?? 'Scheduled task');
      // Done when the Asana task(s) are complete, OR the user marked this block
      // "done for planning" in a prior replan (Asana task stays open).
      const done =
        !!doneOverrides[eventId] || entries.every(e => !incompleteByGid.has(e.asanaTaskId));
      let category: string | null = null;
      for (const e of entries) {
        const tv = asanaTypeByGid.get(e.asanaTaskId);
        category = classifyBlockCategory(tv ? [tv] : [], ctx.quotas);
        if (category) break;
      }
      const { startMs, endMs } = intervalFor(
        eventId,
        first.scheduledDate,
        first.scheduledTime,
        first.duration
      );
      blocks.push({
        googleEventId: eventId,
        googleIntegrationId: first.googleIntegrationId,
        category: category ?? 'Scheduled',
        date: first.scheduledDate,
        start: first.scheduledTime,
        durationMinutes: first.duration,
        titles,
        done,
        startMs,
        endMs,
      });
    }

    // Ad-hoc tasks placed on the calendar (each is its own block).
    for (const t of adHocTasks) {
      if (!t.googleEventId || !t.dueTime || !inWeek(t.dueDate)) continue;
      appEventIds.add(t.googleEventId);
      const category =
        classifyBlockCategory(adHocTypeSignals(t.taskType, customTypes), ctx.quotas) ?? 'Scheduled';
      const duration = t.duration ?? 30;
      const { startMs, endMs } = intervalFor(t.googleEventId, t.dueDate!, t.dueTime, duration);
      blocks.push({
        googleEventId: t.googleEventId,
        googleIntegrationId: t.googleIntegrationId,
        category,
        date: t.dueDate!,
        start: t.dueTime,
        durationMinutes: duration,
        titles: [t.title],
        done: t.completed || !!doneOverrides[t.googleEventId],
        startMs,
        endMs,
      });
    }

    // Meeting-prep blocks (from the prep store). Each re-slots under the extra
    // constraint that it must end before its meeting starts (mustEndBeforeMs).
    for (const p of prepBlocks) {
      if (!inWeek(p.date)) continue;
      appEventIds.add(p.googleEventId);
      const { startMs, endMs } = intervalFor(p.googleEventId, p.date, p.start, p.durationMinutes);
      const meetingStartMs = new Date(p.meetingStart).getTime();
      blocks.push({
        googleEventId: p.googleEventId,
        googleIntegrationId: p.googleIntegrationId,
        category: 'Meeting prep',
        date: p.date,
        start: p.start,
        durationMinutes: p.durationMinutes,
        titles: [`Prep: ${p.meetingTitle}`],
        done: p.done || !!doneOverrides[p.googleEventId],
        startMs,
        endMs,
        ...(Number.isNaN(meetingStartMs) ? {} : { mustEndBeforeMs: meetingStartMs }),
      });
    }

    // Busy intervals from everything that is NOT an app block (real meetings).
    const otherBusy = eventsToBusyIntervals(ctx.weekEvents.filter(e => !appEventIds.has(e.id)));

    const result = planReplan({
      config: ctx.config,
      weekStart: ctx.weekStart,
      now: ctx.now,
      blocks,
      otherBusy,
    });

    return NextResponse.json({
      weekStart: ctx.weekStartStr,
      weekEnd: ctx.weekEndStr,
      ...result,
    });
  } catch (error) {
    console.error('Error analyzing mid-week replan:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze replan' },
      { status: 500 }
    );
  }
}
