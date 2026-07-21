import { NextRequest, NextResponse } from 'next/server';

import { gatherWeekContext } from '@/lib/scheduling/gather';
import { resolveWorkingWindow } from '@/lib/scheduling/engine';
import { proposePrepBlocks, type PrepMeeting } from '@/lib/scheduling/prep';
import {
  classifyPrep,
  normalizePrepKey,
  prepContentHash,
  PREP_PROMPT_VERSION,
  type PrepMeetingInput,
  type PrepResult,
} from '@/lib/prep-classifier';
import { getMeetingPrepDecisions, getPrepBlocks, setMeetingPrepDecision } from '@/lib/user-data-storage';
import { isPrepTitle, prepMeetingTitleFromEvent } from '@/lib/scheduling/event-titles';
import type { CalendarEvent, MeetingPrepDecision } from '@/types';

function localDateStr(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

function localTimeStr(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// POST {
//   weekStart?: string,
//   prepDurations?: Record<eventId, 15|30|60>,
//   prepDays?: Record<eventId, yyyy-MM-dd>,
// }
// Resolve which of the week's future meetings need a prep block (user decision >
// cached AI verdict > fresh classification) and propose a slot for each. AI
// verdicts are persisted. Meetings that already have a "Prep:" event are dropped.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const ctx = await gatherWeekContext(typeof body?.weekStart === 'string' ? body.weekStart : undefined);

    // Working days of the (remaining) week — used to validate day overrides and
    // returned so the UI can offer a per-meeting day dropdown.
    const { workingDays } = resolveWorkingWindow(ctx.config.scheduling, ctx.weekStart, ctx.now);
    const workingDayStrs = workingDays.map(d => d.dateStr);
    const workingDaySet = new Set(workingDayStrs);

    // Per-meeting prep-block length overrides, keyed by eventId. Only 15/30/60
    // are valid values; anything else is dropped (that meeting defaults to 15).
    const prepDurations: Record<string, number> = {};
    if (body?.prepDurations && typeof body.prepDurations === 'object') {
      for (const [eventId, value] of Object.entries(body.prepDurations)) {
        if ([15, 30, 60].includes(value as number)) {
          prepDurations[eventId] = value as number;
        }
      }
    }

    // Per-meeting preferred prep DAY overrides, keyed by eventId. A value is kept
    // only when it is a working day within this week; anything else is dropped
    // (that meeting keeps the default day-before → day-of placement).
    const prepDays: Record<string, string> = {};
    if (body?.prepDays && typeof body.prepDays === 'object') {
      for (const [eventId, value] of Object.entries(body.prepDays)) {
        if (typeof value === 'string' && workingDaySet.has(value)) {
          prepDays[eventId] = value;
        }
      }
    }
    const nowMs = ctx.now.getTime();

    // Meetings that already have a prep block this week (dedupe on re-run).
    // Two sources feed the "already prepped" key set:
    //  (a) any "Prep:"-titled event on the calendar (covers preps created outside
    //      this app, or whose stored record was lost), and
    //  (b) stored prepBlocks whose event STILL EXISTS in the week's fetch.
    // A stored prep block whose event is GONE must NOT suppress re-proposing —
    // that is the user's "I deleted the prep, re-suggest it" case. Because gather
    // runs its reconcile step first (see the ordering note below), a deleted
    // prep's record is normally already purged before we get here, so (b) is
    // belt-and-braces against a record that survived (e.g. an integration whose
    // fetch failed, so reconcile conservatively skipped it) — we still guard on
    // event presence directly so a stale record can never wrongly suppress.
    const preppedTitles = new Set<string>();
    for (const e of ctx.weekEvents) {
      if (isPrepTitle(e.title)) {
        preppedTitles.add(normalizePrepKey(prepMeetingTitleFromEvent(e.title)));
      }
    }

    const presentEventIds = new Set(ctx.weekEvents.map(e => e.id));
    const prepBlocks = await getPrepBlocks();
    for (const p of prepBlocks) {
      // Only a prep block whose event is still on the calendar suppresses a
      // re-proposal. A done prep that still has its event is covered here (and by
      // the title check); a prep whose event was deleted is intentionally NOT
      // suppressed, so the meeting's prep can be re-proposed.
      if (presentEventIds.has(p.googleEventId)) {
        preppedTitles.add(normalizePrepKey(p.meetingTitle));
      }
    }

    // Candidate meetings: future, timed, not declined, not a prep block, not
    // already prepped. A meeting the user has declined isn't being attended, so
    // don't offer prep for it.
    const candidates = ctx.weekEvents.filter(e => {
      if (e.allDay) return false;
      if (e.selfResponseStatus === 'declined') return false;
      if (e.startTime.getTime() <= nowMs) return false;
      if (isPrepTitle(e.title)) return false;
      return !preppedTitles.has(normalizePrepKey(e.title));
    });

    const decisions = await getMeetingPrepDecisions();

    // One PrepMeetingInput per unique title, so duplicates classify once.
    const inputByKey = new Map<string, PrepMeetingInput>();
    for (const e of candidates) {
      const key = normalizePrepKey(e.title);
      if (inputByKey.has(key)) continue;
      const durationMinutes = Math.max(0, Math.round((e.endTime.getTime() - e.startTime.getTime()) / 60000));
      inputByKey.set(key, {
        key,
        title: e.title,
        description: e.description,
        durationMinutes,
        isRecurring: !!e.recurringEventId,
        attendeeCount: e.attendeeCount,
      });
    }

    // Resolve each title: user decision wins; a matching cached AI verdict is
    // reused; otherwise it needs (re)classification.
    const verdicts = new Map<string, { needsPrep: boolean; decidedBy: 'user' | 'ai'; reason: string }>();
    const toClassify: PrepMeetingInput[] = [];
    for (const [key, input] of inputByKey) {
      const decision = decisions[key];
      if (decision?.decidedBy === 'user') {
        verdicts.set(key, { needsPrep: decision.needsPrep, decidedBy: 'user', reason: 'Your choice' });
        continue;
      }
      const hash = prepContentHash(input);
      if (
        decision?.decidedBy === 'ai' &&
        decision.contentHash === hash &&
        decision.promptVersion === PREP_PROMPT_VERSION
      ) {
        verdicts.set(key, { needsPrep: decision.needsPrep, decidedBy: 'ai', reason: '' });
        continue;
      }
      toClassify.push(input);
    }

    if (toClassify.length > 0) {
      let results: PrepResult[];
      try {
        results = await classifyPrep(toClassify);
      } catch (error) {
        console.error('[Scheduling Prep Candidates] classifier failed:', error);
        results = [];
      }
      const byKey = new Map(results.map(r => [r.key, r]));
      const updatedAt = new Date().toISOString();
      for (const input of toClassify) {
        const r = byKey.get(input.key);
        // Conservative default: a meeting the model omitted → needsPrep=false.
        const needsPrep = r?.needsPrep ?? false;
        const reason = r?.reason ?? '';
        verdicts.set(input.key, { needsPrep, decidedBy: 'ai', reason });
        const entry: MeetingPrepDecision = {
          needsPrep,
          decidedBy: 'ai',
          contentHash: prepContentHash(input),
          promptVersion: PREP_PROMPT_VERSION,
          updatedAt,
        };
        await setMeetingPrepDecision(input.key, entry);
      }
    }

    // Meetings needing prep → propose a slot for each event instance.
    const prepMeetings: PrepMeeting[] = [];
    const eventByKey = new Map<string, CalendarEvent>();
    for (const e of candidates) {
      const key = normalizePrepKey(e.title);
      eventByKey.set(e.id, e);
      if (verdicts.get(key)?.needsPrep) {
        prepMeetings.push({
          eventId: e.id,
          title: e.title,
          startMs: e.startTime.getTime(),
          date: localDateStr(e.startTime),
          ...(prepDurations[e.id] ? { durationMinutes: prepDurations[e.id] } : {}),
          ...(prepDays[e.id] ? { preferredDate: prepDays[e.id] } : {}),
        });
      }
    }

    const { placed, unplaced } = proposePrepBlocks({
      meetings: prepMeetings,
      config: ctx.config,
      busyIntervals: ctx.busyIntervals,
      weekStart: ctx.weekStart,
      now: ctx.now,
    });
    const blockByEventId = new Map(placed.map(b => [b.meeting!.eventId, b]));
    const unplacedIds = new Set(unplaced.map(m => m.eventId));

    // One row per candidate event: needsPrep rows carry a proposed block (unless
    // unplaced); needsPrep:false rows are toggleable in the UI.
    const meetings = candidates.map(e => {
      const key = normalizePrepKey(e.title);
      const verdict = verdicts.get(key) ?? { needsPrep: false, decidedBy: 'ai' as const, reason: '' };
      const block = blockByEventId.get(e.id);
      return {
        key,
        eventId: e.id,
        title: e.title,
        date: localDateStr(e.startTime),
        start: localTimeStr(e.startTime),
        needsPrep: verdict.needsPrep,
        decidedBy: verdict.decidedBy,
        reason: verdict.reason,
        ...(block ? { block } : {}),
      };
    });

    const unplacedRows = candidates
      .filter(e => unplacedIds.has(e.id))
      .map(e => ({ key: normalizePrepKey(e.title), title: e.title }));

    return NextResponse.json({ meetings, unplaced: unplacedRows, workingDays: workingDayStrs });
  } catch (error) {
    console.error('Error resolving prep candidates:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to resolve prep candidates' },
      { status: 500 }
    );
  }
}
