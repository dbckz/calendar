// Server-side "is this calendar event actually a task?" classifier for the daily
// review. Mirrors the prep / staleness / AI-suitability classifiers: a versioned
// prompt + per-title content hash so an unchanged title is never re-assessed
// (verdicts are cached in dailyReviewState.titleVerdicts, keyed by normalized
// title).
//
// The deterministic heuristics in scheduling/not-a-task.ts catch the recognisable
// shapes. This layer exists for the ones only judgement can settle — above all a
// bare first name ("Sophie") standing in for a personal catch-up, which no term
// list can enumerate.

import { createHash } from 'node:crypto';

import { runClaudeJsonArray } from './ai-classifier';
import { composePrompt } from './classifier-learning';

export interface ReviewTitleInput {
  key: string; // normalizeReviewTitleKey(title)
  title: string;
  description?: string;
  durationMinutes: number;
  isRecurring: boolean;
}

export interface ReviewTitleResult {
  key: string;
  isTask: boolean;
  reason: string;
}

// Editing this changes REVIEW_TASK_PROMPT_VERSION (a hash), invalidating every
// cached AI verdict BY DESIGN — which is exactly what we want when the stance
// changes: the stricter old verdicts (which hid meetings / calls / catch-ups) get
// re-judged under the looser prompt below rather than lingering.
const PROMPT_TEMPLATE = `You are filtering a person's calendar events before their daily review. The review asks, for each event, "did you get this done?" It should include anything that happened in a work slot and might be worth recording. This person would MUCH rather be asked about one event too many than silently lose a real one.

Set isTask=true for anything that is (or might be) work with something to record. This INCLUDES meetings, 1:1s, calls, stand-ups, interviews and work catch-ups — they happened in a slot and he may want to note how they went — as well as writing or reviewing a document, shipping a change, preparing a deck, replying to a specific thread, or admin with a clear end state.

Set isTask=false ONLY when the event is clearly NOT work to record:
- Clearly personal life: an appointment (dentist, haircut), family or childcare, an errand, a holiday or time off.
- A marker, reminder or hold rather than an activity: "WAKE", an alarm, a bedtime, a buffer, a placeholder hold, commute or travel.
- A personal routine or practice: gratitude, journalling, meditation, exercise.
- A bare personal name with NO work context at all (e.g. "Sophie") — a personal catch-up, not work.

If you are in ANY doubt, set isTask=true. A real item wrongly filtered out is far worse than one extra question — the person can dismiss a stray event themselves in one click.

For EACH event below, output one object. Return ONLY a JSON array, no prose, no code fences:
[{"key":"<key>","isTask":true|false,"reason":"<=12 words on why"}]

Events (recurring | duration | title | notes):
{{EVENTS}}`;

export const REVIEW_TASK_PROMPT_VERSION = createHash('sha256')
  .update(PROMPT_TEMPLATE)
  .digest('hex')
  .slice(0, 12);

// The verdict depends on the title and its notes only — duration and recurrence
// are context, not identity, so two events sharing a title share a verdict.
export function reviewTitleContentHash(input: ReviewTitleInput): string {
  return createHash('sha256')
    .update(`${input.title}\n${input.description || ''}`)
    .digest('hex')
    .slice(0, 16);
}

// `examples` is Dave's own "is this a task?" verdicts as a few-shot block (see
// classifier-learning.ts). PREPENDED at call time and deliberately kept OUT of
// PROMPT_TEMPLATE / REVIEW_TASK_PROMPT_VERSION so a new verdict never invalidates
// the cache. Empty string → the prompt is byte-identical to before.
function buildPrompt(events: ReviewTitleInput[], examples = ''): string {
  const lines = events.map(e => {
    const desc = (e.description || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const recurring = e.isRecurring ? 'recurring' : 'one-off';
    return `[${e.key}] ${recurring} | ${e.durationMinutes}min | ${e.title}${desc ? ` | ${desc}` : ''}`;
  });
  return composePrompt(PROMPT_TEMPLATE.replace('{{EVENTS}}', lines.join('\n')), examples);
}

// Classify a batch of event titles in one headless call. An event the model omits
// gets no result here; the caller keeps it in the review (isTask=true), so a
// classifier hiccup never hides real work. `examples` (optional) are Dave's own
// verdicts, prepended so the model follows his precedent.
export async function classifyReviewTitles(
  events: ReviewTitleInput[],
  timeoutSeconds = 90,
  examples = ''
): Promise<ReviewTitleResult[]> {
  if (events.length === 0) return [];
  const records = await runClaudeJsonArray(buildPrompt(events, examples), timeoutSeconds);
  return records
    .filter(r => typeof r.key === 'string')
    .map(r => ({
      key: String(r.key),
      // Only an explicit false excludes an event.
      isTask: r.isTask !== false,
      reason: String(r.reason || '').slice(0, 120),
    }));
}
