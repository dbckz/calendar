import { NextRequest, NextResponse } from 'next/server';
import { format } from 'date-fns';

import { classifyBlockCategory } from '@/lib/capacity';
import { adHocTypeSignals, gatherWeekContext } from '@/lib/scheduling/gather';
import { eventsToBusyIntervals } from '@/lib/scheduling/free-busy';
import { planReplan, type ReplanBlock, type ReplanReviewBlock } from '@/lib/scheduling/replan';
import {
  getScheduledAsanaTasks,
  getAdHocTasks,
  getCustomTaskTypes,
  getPrepBlocks,
  getRitualBlocks,
  getBlockDoneOverrides,
  getDailyReviewState,
} from '@/lib/user-data-storage';
import { logicalTodayDate, normalizeRolloverHour } from '@/lib/date-utils';
import { ritualKindForTitle, isBreakTitle, existingRitualTitlesByDateFromEvents, RITUAL_TITLES } from '@/lib/scheduling/rituals';
import { selectCalendarReviewBlocks } from '@/lib/scheduling/calendar-review';
import { prepTitle } from '@/lib/scheduling/event-titles';
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
    const [scheduledAsana, adHocTasks, customTypes, prepBlocks, ritualBlocks, doneOverrides, reviewState] = await Promise.all([
      getScheduledAsanaTasks(),
      getAdHocTasks(),
      getCustomTaskTypes(),
      getPrepBlocks(),
      getRitualBlocks(),
      getBlockDoneOverrides(),
      getDailyReviewState(),
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

    // Past app blocks (task/prep, never ritual) for the daily-review step. Built
    // here where each block's task refs are still in hand; filtered to blocks
    // that ended within the review window: after the last completed review (or
    // the start of the logical day when none) and at/before now. This keeps the
    // review to "what happened since you last reviewed" rather than the whole
    // week — the replan planning below still spans the full week.
    const nowMs = ctx.now.getTime();
    const rolloverHour = normalizeRolloverHour(ctx.config.scheduling?.dayRolloverHour);
    const logicalDayStart = logicalTodayDate(ctx.now, rolloverHour);
    logicalDayStart.setHours(rolloverHour, 0, 0, 0);
    const lastReviewedMs = reviewState.lastReviewedAt
      ? Date.parse(reviewState.lastReviewedAt)
      : NaN;
    const reviewStartMs = Number.isNaN(lastReviewedMs)
      ? logicalDayStart.getTime()
      : lastReviewedMs;
    const dismissedTitles = new Set(reviewState.dismissedTitles);
    // eventId → backing task ids (Asana gid / ad-hoc id), so unplaceable rows can
    // carry what to defer. Preps have no deferrable task.
    const taskIdsByEvent = new Map<string, string[]>();
    const reviewBlocks: ReplanReviewBlock[] = [];
    const pushReview = (b: ReplanReviewBlock) => {
      if (b.endMs > reviewStartMs && b.endMs <= nowMs) reviewBlocks.push(b);
    };

    // Group scheduled Asana tasks by their Google event: a grouped block records
    // several tasks against one event.
    const asanaGroups = new Map<string, ScheduledAsanaTask[]>();
    for (const s of scheduledAsana) {
      if (!s.googleEventId || !inWeek(s.scheduledDate)) continue;
      const list = asanaGroups.get(s.googleEventId) ?? [];
      list.push(s);
      asanaGroups.set(s.googleEventId, list);
    }

    // Recover a task title from the app-created calendar event for legacy
    // scheduled entries with no stored taskName: a single-task event is titled
    // with the task name (category emoji prefix), and a grouped event's
    // description carries a "• <title>\n  <asana url>" agenda line per task
    // (see event-titles.ts).
    const titleFromEvent = (eventId: string, gid: string, single: boolean): string | undefined => {
      const ev = eventById.get(eventId);
      if (!ev) return undefined;
      if (single) {
        const stripped = ev.title.replace(/^\s*\p{Extended_Pictographic}️?\s*/u, '').trim();
        return stripped || undefined;
      }
      const m = (ev.description ?? '').match(
        new RegExp(`•\\s*(.+)\\s*\\n\\s*https://app\\.asana\\.com/0/\\d+/${gid}\\b`)
      );
      return m?.[1]?.trim() || undefined;
    };

    for (const [eventId, entries] of asanaGroups) {
      appEventIds.add(eventId);
      taskIdsByEvent.set(eventId, entries.map(e => e.asanaTaskId));
      const first = entries[0];
      // Prefer the live Asana name — the incomplete fetch first, then the
      // completed-inclusive name map so a member completed this week still
      // resolves; then the title captured at scheduling time; then a title
      // recovered from the calendar event — so a task already completed (and thus
      // absent from the incomplete fetch) still shows its name rather than a
      // generic placeholder.
      const titles = entries.map(
        e =>
          incompleteByGid.get(e.asanaTaskId)?.name ??
          ctx.asanaNameByGid.get(e.asanaTaskId) ??
          e.taskName ??
          titleFromEvent(eventId, e.asanaTaskId, entries.length === 1) ??
          'Scheduled task'
      );
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
      pushReview({
        googleEventId: eventId,
        googleIntegrationId: first.googleIntegrationId,
        kind: 'task',
        category: category ?? 'Scheduled',
        date: first.scheduledDate,
        start: first.scheduledTime,
        durationMinutes: first.duration,
        startMs,
        endMs,
        done,
        titles,
        tasks: entries.map((e, i) => {
          // Done here means "complete in Asana": the gid is absent from the live
          // incomplete fetch. Distinct from a block-level "done for planning"
          // override, which never marks the individual task done.
          const asanaComplete = !incompleteByGid.has(e.asanaTaskId);
          return {
            title: titles[i],
            done: asanaComplete,
            gid: e.asanaTaskId,
            ...(e.integrationId ? { integrationId: e.integrationId } : {}),
            ...(asanaComplete ? { completedInAsana: true } : {}),
          };
        }),
      });
    }

    // Ad-hoc tasks placed on the calendar (each is its own block).
    for (const t of adHocTasks) {
      if (!t.googleEventId || !t.dueTime || !inWeek(t.dueDate)) continue;
      appEventIds.add(t.googleEventId);
      taskIdsByEvent.set(t.googleEventId, [t.id]);
      const category =
        classifyBlockCategory(adHocTypeSignals(t.taskType, customTypes), ctx.quotas) ?? 'Scheduled';
      const duration = t.duration ?? 30;
      const { startMs, endMs } = intervalFor(t.googleEventId, t.dueDate!, t.dueTime, duration);
      const adhocDone = t.completed || !!doneOverrides[t.googleEventId];
      blocks.push({
        googleEventId: t.googleEventId,
        googleIntegrationId: t.googleIntegrationId,
        category,
        date: t.dueDate!,
        start: t.dueTime,
        durationMinutes: duration,
        titles: [t.title],
        done: adhocDone,
        startMs,
        endMs,
      });
      pushReview({
        googleEventId: t.googleEventId,
        googleIntegrationId: t.googleIntegrationId,
        kind: 'task',
        category,
        date: t.dueDate!,
        start: t.dueTime,
        durationMinutes: duration,
        startMs,
        endMs,
        done: adhocDone,
        titles: [t.title],
        tasks: [{ title: t.title, done: adhocDone, adhocId: t.id }],
      });
    }

    // Meeting-prep blocks (from the prep store). Each re-slots under the extra
    // constraint that it must end before its meeting starts (mustEndBeforeMs).
    for (const p of prepBlocks) {
      if (!inWeek(p.date)) continue;
      appEventIds.add(p.googleEventId);
      const { startMs, endMs } = intervalFor(p.googleEventId, p.date, p.start, p.durationMinutes);
      const meetingStartMs = new Date(p.meetingStart).getTime();
      const prepDone = p.done || !!doneOverrides[p.googleEventId];
      const prepTitleStr = prepTitle(p.meetingTitle);
      blocks.push({
        googleEventId: p.googleEventId,
        googleIntegrationId: p.googleIntegrationId,
        category: 'Meeting prep',
        date: p.date,
        start: p.start,
        durationMinutes: p.durationMinutes,
        titles: [prepTitleStr],
        done: prepDone,
        startMs,
        endMs,
        ...(Number.isNaN(meetingStartMs) ? {} : { mustEndBeforeMs: meetingStartMs }),
      });
      pushReview({
        googleEventId: p.googleEventId,
        googleIntegrationId: p.googleIntegrationId,
        kind: 'prep',
        category: 'Meeting prep',
        date: p.date,
        start: p.start,
        durationMinutes: p.durationMinutes,
        startMs,
        endMs,
        done: prepDone,
        titles: [prepTitleStr],
        tasks: [{ title: prepTitleStr, done: prepDone }],
      });
    }

    // Daily ritual blocks (lunch/exercise/emails). Never "missed" — only a future
    // ritual that now conflicts with a meeting is moved (re-slotted to its window).
    const RITUAL_CATEGORY = {
      lunch: 'Lunch',
      exercise: 'Exercise',
      emails: 'Emails',
      kindleNotes: 'Kindle notes',
      grooming: 'Backlog grooming',
      retro: 'Retrospective',
      break: 'Break',
    } as const;
    for (const r of ritualBlocks) {
      if (!inWeek(r.date)) continue;
      appEventIds.add(r.googleEventId);
      const kind = ritualKindForTitle(r.title);
      // Only lunch / exercise / break split work runs; emails + the WORK rituals
      // (kindle / grooming / retro) count as work.
      const isBreak = isBreakTitle(r.title);
      const { startMs, endMs } = intervalFor(r.googleEventId, r.date, r.start, r.durationMinutes);
      blocks.push({
        googleEventId: r.googleEventId,
        googleIntegrationId: r.googleIntegrationId,
        category: RITUAL_CATEGORY[kind],
        date: r.date,
        start: r.start,
        durationMinutes: r.durationMinutes,
        titles: [r.title],
        done: false, // rituals are never "done"
        startMs,
        endMs,
        ritualKind: kind,
        isBreak,
      });
    }

    // Ad-hoc Google Calendar events with no local record (added straight into
    // Google). Reviewed as solo work: skip meetings, all-day events, rituals and
    // app blocks; match each to an incomplete Asana task where possible.
    for (const b of selectCalendarReviewBlocks({
      events: ctx.weekEvents,
      appEventIds,
      ritualTitles: new Set(RITUAL_TITLES),
      dismissedTitles,
      nowMs,
      reviewStartMs,
      inWeek,
      doneOverrides,
      asanaTasks: ctx.asanaCandidates.map(c => ({
        gid: c.task.gid,
        name: c.task.name,
        integrationId: c.integrationId,
      })),
    })) {
      reviewBlocks.push(b);
    }

    // Busy intervals from everything that is NOT an app block (real meetings).
    const otherBusy = eventsToBusyIntervals(ctx.weekEvents.filter(e => !appEventIds.has(e.id)));

    const result = planReplan({
      config: ctx.config,
      weekStart: ctx.weekStart,
      now: ctx.now,
      blocks,
      otherBusy,
      // Live ritual titles per date (includes manually-added ritual events) so a
      // remaining working day missing a ritual gets an addition proposed.
      existingRitualTitlesByDate: existingRitualTitlesByDateFromEvents(ctx.weekEvents),
    });

    // Earliest-first so the review reads chronologically.
    reviewBlocks.sort((a, b) => a.endMs - b.endMs);

    // Attach the deferrable task ids to each unplaceable block.
    const unplaceable = result.unplaceable.map(u => ({
      ...u,
      deferTaskIds: taskIdsByEvent.get(u.googleEventId) ?? [],
    }));

    // Displaceable blocks scheduled TOMORROW, offered as bump targets for the
    // "prioritise tomorrow" option on an unplaceable block. Only future, not-done
    // app blocks backed by deferrable work qualify — task/ad-hoc blocks (they have
    // entries in taskIdsByEvent); rituals, breaks and meeting-prep are excluded
    // (no taskIdsByEvent entry), and real Google meetings are never app blocks.
    const tomorrow = new Date(ctx.now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = format(tomorrow, 'yyyy-MM-dd');
    const tomorrowBlocks = blocks
      .filter(
        b =>
          b.date === tomorrowStr &&
          !b.done &&
          b.startMs > nowMs &&
          (taskIdsByEvent.get(b.googleEventId)?.length ?? 0) > 0
      )
      .map(b => ({
        googleEventId: b.googleEventId,
        googleIntegrationId: b.googleIntegrationId,
        category: b.category,
        titles: b.titles,
        date: b.date,
        start: b.start,
        durationMinutes: b.durationMinutes,
        taskIds: taskIdsByEvent.get(b.googleEventId) ?? [],
      }));

    return NextResponse.json({
      weekStart: ctx.weekStartStr,
      weekEnd: ctx.weekEndStr,
      ...result,
      unplaceable,
      tomorrowBlocks,
      reviewBlocks,
    });
  } catch (error) {
    console.error('Error analyzing mid-week replan:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze replan' },
      { status: 500 }
    );
  }
}
