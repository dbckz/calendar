// Server-side meeting-prep classifier. Judges which of the week's meetings are
// substantive enough to warrant a 30-minute prep block. Mirrors the staleness /
// AI-suitability classifiers: a versioned prompt + per-meeting content hash so
// unchanged meetings aren't re-assessed (see user-data-storage
// meetingPrepDecisions, which caches AI verdicts keyed by normalized title).

import { createHash } from 'node:crypto';
import { runClaudeJsonArray } from './ai-classifier';

export interface PrepMeetingInput {
  key: string; // normalized title (see normalizePrepKey)
  title: string;
  description?: string;
  durationMinutes: number;
  isRecurring: boolean;
  attendeeCount?: number;
}

export interface PrepResult {
  key: string;
  needsPrep: boolean;
  reason: string;
}

// Stable key for a meeting: lowercase, trimmed, whitespace collapsed. Decisions
// are remembered per title, so two events with the same title share a verdict.
export function normalizePrepKey(title: string): string {
  return title.replace(/\s+/g, ' ').trim().toLowerCase();
}

// Editing this changes PREP_PROMPT_VERSION (a hash), invalidating cached verdicts.
const PROMPT_TEMPLATE = `You are reviewing a person's upcoming meetings to decide which ones genuinely warrant a 30-minute preparation block beforehand. Prep is worth booking for substantive meetings where turning up unprepared would hurt.

Flag needsPrep=true when the meeting looks like it rewards preparation, for example:
- An external meeting, a 1:1, or a call with people outside the immediate team.
- A meeting where a decision is made, something is reviewed/approved, or a pitch/proposal is presented.
- An interview, a board or client meeting, or a first conversation with someone new.

Flag needsPrep=false when prep would be wasted, for example:
- A recurring "heartbeat" meeting: standup, weekly sync, regular check-in, retro.
- A focus/deep-work block, personal event, commute, lunch, or a hold on the calendar.
- A large all-hands or broadcast where the person is a passive attendee.
- You are unsure. Be CONSERVATIVE — only flag clear prep-worthy meetings. When in doubt, needsPrep=false.

For EACH meeting below, output one object. Return ONLY a JSON array, no prose, no code fences:
[{"key":"<key>","needsPrep":true|false,"reason":"<=12 words on why (or why not)"}]

Meetings (recurring | attendees | duration | title | notes):
{{MEETINGS}}`;

export const PREP_PROMPT_VERSION = createHash('sha256').update(PROMPT_TEMPLATE).digest('hex').slice(0, 12);

// Prep-worthiness depends on the title, notes and whether it recurs (the key
// negative signal), so fold those into the fingerprint.
export function prepContentHash(m: PrepMeetingInput): string {
  return createHash('sha256')
    .update(`${m.title}\n${m.description || ''}\n${m.isRecurring ? 'recurring' : 'oneoff'}`)
    .digest('hex')
    .slice(0, 16);
}

function buildPrompt(meetings: PrepMeetingInput[]): string {
  const lines = meetings.map(m => {
    const desc = (m.description || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const recurring = m.isRecurring ? 'recurring' : 'one-off';
    const attendees = m.attendeeCount ?? '?';
    return `[${m.key}] ${recurring} | attendees:${attendees} | ${m.durationMinutes}min | ${m.title}${desc ? ` | ${desc}` : ''}`;
  });
  return PROMPT_TEMPLATE.replace('{{MEETINGS}}', lines.join('\n'));
}

// Classify a batch of meetings for prep-worthiness in one headless call.
// Conservative: any meeting the model omits is treated as needsPrep=false by the
// caller (it simply gets no result here).
export async function classifyPrep(meetings: PrepMeetingInput[], timeoutSeconds = 120): Promise<PrepResult[]> {
  if (meetings.length === 0) return [];
  const records = await runClaudeJsonArray(buildPrompt(meetings), timeoutSeconds);
  return records
    .filter(r => typeof r.key === 'string')
    .map(r => ({ key: String(r.key), needsPrep: Boolean(r.needsPrep), reason: String(r.reason || '').slice(0, 120) }));
}
