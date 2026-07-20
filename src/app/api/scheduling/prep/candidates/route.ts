import { NextRequest, NextResponse } from 'next/server';

import { gatherWeekContext } from '@/lib/scheduling/gather';
import { proposePrepBlocks, type PrepMeeting } from '@/lib/scheduling/prep';
import {
  classifyPrep,
  normalizePrepKey,
  prepContentHash,
  PREP_PROMPT_VERSION,
  type PrepMeetingInput,
  type PrepResult,
} from '@/lib/prep-classifier';
import { getMeetingPrepDecisions, setMeetingPrepDecision } from '@/lib/user-data-storage';
import type { CalendarEvent, MeetingPrepDecision } from '@/types';

const PREP_TITLE_PREFIX = 'Prep: ';

function localDateStr(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

function localTimeStr(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// POST { weekStart?: string }
// Resolve which of the week's future meetings need a prep block (user decision >
// cached AI verdict > fresh classification) and propose a slot for each. AI
// verdicts are persisted. Meetings that already have a "Prep:" event are dropped.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const ctx = await gatherWeekContext(typeof body?.weekStart === 'string' ? body.weekStart : undefined);
    const nowMs = ctx.now.getTime();

    // Meetings that already have a prep block this week (dedupe on re-run).
    const preppedTitles = new Set<string>();
    for (const e of ctx.weekEvents) {
      if (e.title.startsWith(PREP_TITLE_PREFIX)) {
        preppedTitles.add(normalizePrepKey(e.title.slice(PREP_TITLE_PREFIX.length)));
      }
    }

    // Candidate meetings: future, timed, not a prep block, not already prepped.
    const candidates = ctx.weekEvents.filter(e => {
      if (e.allDay) return false;
      if (e.startTime.getTime() <= nowMs) return false;
      if (e.title.startsWith(PREP_TITLE_PREFIX)) return false;
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
        prepMeetings.push({ eventId: e.id, title: e.title, startMs: e.startTime.getTime(), date: localDateStr(e.startTime) });
      }
    }

    const { placed, unplaced } = proposePrepBlocks({
      meetings: prepMeetings,
      config: ctx.config,
      busyIntervals: ctx.busyIntervals,
      existingBlocksByDate: ctx.existingBlocksByDate,
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

    return NextResponse.json({ meetings, unplaced: unplacedRows });
  } catch (error) {
    console.error('Error resolving prep candidates:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to resolve prep candidates' },
      { status: 500 }
    );
  }
}
