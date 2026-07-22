// Server-side generator for the short, reflective message shown after the daily
// review step ("here's how your day went"). Given a summary of what got done vs
// what didn't, it asks a FAST headless `claude -p` call for one warm, varied
// sentence — variety is the point, so we never return a fixed string on the
// happy path. The call is best-effort: any failure (CLI missing, timeout,
// garbled output) falls back to a bucketed pool of canned messages, so the
// review flow can never block or error on this.

import { runClaudeText } from './ai-classifier';

export interface ReviewOutcome {
  doneCount: number;
  totalCount: number;
  doneTitles: string[];
  notDoneTitles: string[];
}

// Coarse completion bucket, used both to steer the prompt and to pick a fallback.
export type CompletionBucket = 'all' | 'most' | 'some' | 'none';

// Pin encouragement to a fast, cheap model (latency matters for a single
// sentence). Override via REVIEW_MESSAGE_MODEL, mirroring the classifier's
// CLAUDE_MODEL override.
function encouragementModel(): string {
  return process.env.REVIEW_MESSAGE_MODEL || 'claude-haiku-4-5-20251001';
}

// A block counts done when all its tasks are done, so totalCount is the number
// of reviewed blocks. Empty review → 'none' (the caller shouldn't ask, but be safe).
export function completionBucket(outcome: ReviewOutcome): CompletionBucket {
  const { doneCount, totalCount } = outcome;
  if (totalCount <= 0) return 'none';
  if (doneCount <= 0) return 'none';
  if (doneCount >= totalCount) return 'all';
  return doneCount / totalCount >= 0.6 ? 'most' : 'some';
}

// Bucketed canned messages for when the model is unavailable. British English,
// warm, no guilt on the low-completion buckets.
const FALLBACK_MESSAGES: Record<CompletionBucket, string[]> = {
  all: [
    'Amazing job getting everything done today.',
    'A clean sweep — everything you planned is done. Well done.',
    'Every block ticked off. That is a genuinely good day.',
  ],
  most: [
    'Really solid day — you got through most of what you planned.',
    'Good going today. The bulk of it is done and the rest will keep.',
    'Most of it done and dusted. Nice work.',
  ],
  some: [
    'You made real progress today, even if not everything got a tick.',
    'A few things moved forward today — that counts. The rest carries over.',
    'Some good headway today. Tomorrow can pick up the thread.',
  ],
  none: [
    'Some days just do not go to plan, and that is genuinely okay. The day is done — fresh start tomorrow.',
    'Today did not go the way you hoped, and that is alright. Let it go and begin again tomorrow.',
    'Not the day you planned, but it is behind you now. Rest, and start fresh tomorrow.',
  ],
};

// Deterministic-enough randomness; a fresh pick each call keeps fallbacks varied.
export function pickFallback(outcome: ReviewOutcome): string {
  const pool = FALLBACK_MESSAGES[completionBucket(outcome)];
  return pool[Math.floor(Math.random() * pool.length)];
}

// A short readable list of task titles for the prompt (cap the count/length so a
// huge day doesn't blow up the prompt).
function titleList(titles: string[]): string {
  const cleaned = titles.map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 8);
  return cleaned.length ? cleaned.join('; ') : '(none)';
}

export function buildEncouragementPrompt(outcome: ReviewOutcome): string {
  const bucket = completionBucket(outcome);
  const steer: Record<CompletionBucket, string> = {
    all: 'They finished everything they planned — be genuinely celebratory.',
    most: 'They finished most of it — proportionate, honest encouragement.',
    some: 'They finished some of it — proportionate, honest encouragement.',
    none: 'They finished little or nothing — be reassuring and kind. Acknowledge it honestly, with no guilt or pressure; the day is done and tomorrow is a fresh start.',
  };

  return `You are a warm, encouraging companion reflecting with someone at the end of their working day, just after they reviewed what got done.

Here is how their day went:
- Completed ${outcome.doneCount} of ${outcome.totalCount} planned work blocks.
- Got done: ${titleList(outcome.doneTitles)}
- Didn't get to: ${titleList(outcome.notDoneTitles)}

${steer[bucket]}

Write ONE short reflective message (1-2 sentences) to show them now. Make it warm and human, British English. You may reference one specific task by name if it feels natural, but do not list them. At most one emoji (often none). No greeting, no sign-off, no quotation marks. Vary your phrasing so it feels fresh each time.

Return ONLY the message text, nothing else.`;
}

// Trim the model's raw text to a single clean message, or null if it looks like
// garbage (empty, or implausibly long — the model ignored the brief).
export function sanitizeMessage(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/```$/, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || cleaned.length > 400) return null;
  return cleaned;
}

// Generate the review message. Never throws: on any failure it returns a
// bucketed fallback so the review flow is never blocked.
export async function generateReviewMessage(outcome: ReviewOutcome, timeoutSeconds = 15): Promise<string> {
  try {
    const raw = await runClaudeText(buildEncouragementPrompt(outcome), {
      timeoutSeconds,
      model: encouragementModel(),
    });
    return sanitizeMessage(raw) ?? pickFallback(outcome);
  } catch {
    return pickFallback(outcome);
  }
}
