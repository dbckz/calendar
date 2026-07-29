// Shared, I/O-free helpers that let Dave's OWN past verdicts teach the task
// classifiers over time, without ever polluting their result caches.
//
// Every classifier already has (a) a stable per-item key and (b) "a user verdict
// beats the AI". This adds (c): feed his labelled verdicts back to the model as a
// small, balanced set of few-shot examples, so it drifts TOWARDS his judgement
// instead of re-deriving the same call from scratch.
//
// Two pieces, both pure so they can be unit-tested and shared:
//   * buildExamplesBlock — a bounded, balanced few-shot block, built from
//     labelled user verdicts, ready to append to a prompt.
//   * isVerdictReusable — the cache gate every classifier repeats (user verdict,
//     or an AI verdict whose content hash + prompt version still match).
//
// WARNING — the examples block MUST be appended to the prompt AT CALL TIME and
// MUST NOT be folded into the hashed PROMPT_TEMPLATE / PROMPT_VERSION. The version
// hash is the cache key: if examples fed it, a single new verdict would change the
// hash and invalidate EVERY cached verdict, re-running the classifier over Dave's
// whole history on every change. Keeping examples out of the hash means the cache
// survives and only genuinely-unseen items ever hit the model.
//
// Only ever pass verdicts Dave decided himself (decidedBy === 'user'). Never feed
// the AI's own past verdicts back as examples — it would cite its own guesses as
// precedent and entrench its mistakes.

// One labelled example: an item Dave ruled on. `key` is the example text (a title
// or task name), `label` its class ('true'/'false', a category, …), `at` when he
// decided (ISO string or epoch ms) so the most RECENT verdicts win.
export interface LabelledVerdict {
  key: string;
  label: string;
  at?: string | number;
}

export interface ExamplesOptions {
  // Most-recent N kept per class before balancing (default 15).
  perClass?: number;
  // Hard cap across all classes after balancing (default 40).
  maxTotal?: number;
  // Each key is truncated to this many chars, with an ellipsis (default 80).
  keyMaxChars?: number;
  // The line(s) introducing the block. Appears above the examples; omitted from
  // the output entirely when there are no examples.
  heading?: string;
  // Maps a raw label to the text shown after the arrow, e.g. 'true' → "IS a task".
  // Defaults to the label verbatim.
  render?: (label: string) => string;
}

const DEFAULTS = { perClass: 15, maxTotal: 40, keyMaxChars: 80 } as const;

// Sort helper: most recent first. A missing `at` sorts last (oldest), so dated
// verdicts are always preferred over undated ones.
function atValue(at: string | number | undefined): number {
  if (at === undefined) return -Infinity;
  return typeof at === 'number' ? at : Date.parse(at) || -Infinity;
}

function truncateKey(key: string, max: number): string {
  const clean = key.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

// Build a compact, balanced few-shot block from Dave's labelled verdicts.
//
// Balancing: the most-recent `perClass` per class are kept, then classes are
// interleaved round-robin (newest-first) up to `maxTotal`, so no single class can
// swamp the block even when Dave has ruled far more one way than the other.
//
// Returns '' when there is nothing to show, so a caller can append the result
// unconditionally and get a byte-identical prompt when Dave has no verdicts yet.
export function buildExamplesBlock(
  verdicts: LabelledVerdict[],
  opts: ExamplesOptions = {}
): string {
  const perClass = opts.perClass ?? DEFAULTS.perClass;
  const maxTotal = opts.maxTotal ?? DEFAULTS.maxTotal;
  const keyMaxChars = opts.keyMaxChars ?? DEFAULTS.keyMaxChars;
  const render = opts.render ?? ((label: string) => label);

  // Dedupe by key, newest verdict winning — so a title Dave re-judged (false then
  // true) appears once, with his latest call, never as a contradictory pair.
  const latestByKey = new Map<string, LabelledVerdict>();
  for (const v of verdicts) {
    const key = v.key?.replace(/\s+/g, ' ').trim();
    if (!key) continue;
    const prev = latestByKey.get(key);
    if (!prev || atValue(v.at) >= atValue(prev.at)) latestByKey.set(key, { ...v, key });
  }

  // Group by class, preserving first-seen class order for deterministic output.
  const byClass = new Map<string, LabelledVerdict[]>();
  for (const v of latestByKey.values()) {
    const list = byClass.get(v.label) ?? [];
    list.push(v);
    byClass.set(v.label, list);
  }
  if (byClass.size === 0) return '';

  // Newest-first within each class, capped at perClass.
  const queues = [...byClass.values()].map(list =>
    [...list].sort((a, b) => atValue(b.at) - atValue(a.at)).slice(0, perClass)
  );

  // Round-robin across classes so the cap is shared evenly, not spent on one class.
  const picked: LabelledVerdict[] = [];
  for (let i = 0; picked.length < maxTotal; i++) {
    let tookOne = false;
    for (const queue of queues) {
      if (i >= queue.length) continue;
      picked.push(queue[i]);
      tookOne = true;
      if (picked.length >= maxTotal) break;
    }
    if (!tookOne) break;
  }
  if (picked.length === 0) return '';

  const lines = picked.map(v => `- "${truncateKey(v.key, keyMaxChars)}" → ${render(v.label)}`);
  return opts.heading ? `${opts.heading}\n${lines.join('\n')}` : lines.join('\n');
}

// Compose the final prompt: the few-shot examples (if any) PREPENDED to the
// hashed base template. This is the ONLY sanctioned way to attach examples, and
// it never touches `base` — so a classifier's PROMPT_VERSION (a hash of `base`
// alone) is unaffected by examples, and an empty block yields a byte-identical
// prompt. See the WARNING at the top of this file.
export function composePrompt(base: string, examples: string): string {
  return examples ? `${examples}\n\n${base}` : base;
}

// The cache gate every classifier repeats: a cached verdict is reusable when Dave
// decided it (his call is permanent), or when the AI decided it and both the
// content hash and the prompt version still match (nothing about the item or the
// prompt has changed since).
export interface CacheableVerdict {
  decidedBy: 'user' | 'ai';
  contentHash?: string;
  promptVersion?: string;
}

export function isVerdictReusable(
  verdict: CacheableVerdict | undefined,
  currentContentHash: string,
  currentPromptVersion: string
): boolean {
  if (!verdict) return false;
  if (verdict.decidedBy === 'user') return true;
  return (
    verdict.decidedBy === 'ai' &&
    verdict.contentHash === currentContentHash &&
    verdict.promptVersion === currentPromptVersion
  );
}
