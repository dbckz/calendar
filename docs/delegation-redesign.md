# Delegation workflow redesign

Status: advised 2026-07-12, revised 2026-07-13, **implemented 2026-07** — the
design below shipped. The app owns the delegation queue (in `user-data.json`),
a budget-aware launchd pacer drains it (`workers/orchestrator/`), and runs
execute via `claude -p` with `stream-json` traces the UI renders. This document
is kept as the design record; the sections below describe what was built.

Shipped: app-owned queue (`DelegationState` in `src/types/index.ts`), compose
modal (`src/components/DelegateModal.tsx`), detached "Run now" path
(`src/app/api/orchestrator/run-now/`), pacer with per-hour caps plus
active/sleep-hours windows and usage-limit backoff (`pausedUntil` in
`workers/orchestrator/status.ts`), `stream-json` per-run traces in `agent-runs/`
rendered by `src/components/TraceTimeline.tsx`, and a no-Bash tool allowlist
(`workers/orchestrator/config.ts`).

## Problems with the current flow

1. **Magic format required.** The orchestrator only acts on tasks whose Asana
   description contains an `agent_work_containers:` bullet list in a specific
   syntax (`~skill-name` or free text). That's a wire format leaking into the
   UX — the "Delegate to agent" button warns about it rather than solving it.
2. **Brief and task are conflated.** What you want the agent to *do* often
   isn't the task description — it's context you'd naturally type at
   delegation time. There's nowhere to put that.
3. **Results live in Asana comments.** You delegate from the dashboard but
   have to go to Asana to read the outcome. The status file only carries a
   one-line summary.
4. **Polling-as-discovery adds latency and ceremony.** The worker discovers
   work by polling Asana tags every 10 minutes. But the app knows the moment
   you click Delegate — tag-polling solves a problem the app doesn't have.

## What the queue is actually for

Getting this right reframes the design. Two distinct delegation modes:

- **"Do this now"** — one task, you're at the dashboard, you want it running
  in seconds and the result soon after. Needs no queue at all: spawn on
  delegate.
- **"Work through these"** — potentially *many* tasks (dozens+) that agents
  could in principle handle, given good briefs. You can't run them all at
  once: you'd need a terminal per task and you'd blow through usage limits in
  an hour. What you want is a background drip: agents steadily picking tasks
  off a queue all day, spread out so there's always some work happening and
  you never hit the ceiling.

The original orchestrator conflated discovery (polling Asana) with pacing
(one task per tick). The redesign separates them: **the app owns discovery**
(delegate = enqueue), **the scheduler owns pacing** (drain the queue at a
sustainable rate).

## Proposed design

### 1. Compose the brief at delegate time
"Delegate to agent" opens a modal pre-filled from the task (title, notes,
task metadata) where you write/edit the instruction in plain English. No
magic syntax. Choose a mode: **Run now** or **Queue for background**.
Bulk-select in the task list → "Queue all" for the many-tasks case.

### 2. App-owned queue, not Asana descriptions
Briefs live in the app's user-data store keyed by Asana task GID, with state
(`queued | running | done | failed`), priority, and timestamps. The
`agent_ready` / `agent_in_progress` / `agent_complete` Asana tags stay as
visible status inside Asana, but they're decoration — the app's queue is the
protocol. Fragile description-parsing goes away; briefs can be long, edited,
or private.

### 3. Two execution paths, one runner
- **Run now**: API route spawns `claude -p` as a *detached* background
  process immediately (a 15-minute run can't live inside an HTTP request).
- **Background drain**: the launchd job survives, but reframed as a *pacer*.
  Each tick (e.g. every 20–30 min) it asks the app's queue API for the next
  task and runs at most one, subject to the budget policy below.

Both paths share the runner module (`claude -p --output-format json` with the
allowlist), the PID/heartbeat lock (never more than one run at a time), and
the status file.

### 4. Usage-budget policy (the point of the pacer)
The drain loop is budget-aware so a 100-task queue never torches your limits:
- **Max runs per hour / per day** (configurable in workflow-config).
- **Usage-limit detection**: when `claude -p` fails with a usage-limit error,
  the CLI reports the reset time — the pacer parses it, records
  `pausedUntil` in the status file, and skips ticks until then. No retries
  against a closed door.
- **Optional quiet/active hours** (e.g. drain harder overnight when you're
  not using Claude interactively).

### 5. Trace visibility (added 2026-07-13)
Headless runs are not a black box. Verified against Claude Code docs
(code.claude.com/docs/en/headless.md, sessions.md, errors.md):
- **Live structured trace**: the runner invokes
  `--output-format stream-json --verbose` (instead of `json`), which emits
  every event — tool calls, tool results, text — as JSONL on stdout in real
  time. The runner tees this to a per-run trace file
  (`~/.claude/data/calendar/agent-runs/<taskGid>-<ts>.jsonl`). The app
  renders it as a timeline in the task dialog / Delegation widget, live-tailed
  while the run is in progress.
- **Session resume**: each run's `session_id` is stored with the result.
  Headless sessions persist like interactive ones, so
  `claude --resume <session-id>` (run from the agent workspace directory —
  sessions are cwd-keyed) opens the full session in a terminal to inspect or
  *continue* the task interactively. The UI shows a copyable resume command
  per run.
- **Fallback transcript** exists at
  `~/.claude/projects/<workspace-dir>/<session-id>.jsonl`, but its format is
  internal/version-dependent — the UI renders from our own trace file, never
  from this.
- **Usage-limit parsing confirmed**: limit errors print
  `You've hit your session limit · resets 3:45pm` on stderr; the pacer parses
  the `resets <time>` fragment for its `pausedUntil` backoff.

### 6. Full results rendered in-app
The worker stores the complete markdown report per run; the task dialog and
the Delegation widget render it (queue position, running, recent results).
The Asana comment is still posted as the permanent record.

## Net effect

- Single task: *type what you want → running in seconds → read the result*.
- Bulk: *brief a pile of tasks once → they drain steadily all day within
  budget → review results as they land*.
- Asana remains the record, the app is the interface, and the launchd job is
  a deliberately dumb metronome rather than an orchestrator.

## Related decisions already implemented

- Runner is headless Claude Code (`claude -p --output-format json`) with an
  explicit `--allowedTools` allowlist (Skill, Read, Write, WebSearch,
  WebFetch, claude.ai MCP connectors) — deliberately no Bash and no
  `--dangerously-skip-permissions`.
- `~skill-name` containers map to "use your `<name>` skill", so existing
  skills (event-cheat-sheet, meeting-briefing, …) are delegable.

## Sizing

Somewhat larger than the 2026-07-12 version: queue store + API, compose modal
(with bulk enqueue), detached spawn path, pacer rewrite of the worker
(budget policy + usage-limit backoff), report rendering. Still one focused
phase; the pacer replaces rather than adds to the existing poller code.

## Implementation notes for the executing session

Repo state when this was written (2026-07-13): branch `feat/command-center`,
~15 commits ahead of `claude/daily-planner-app-g6aCf`, NOT pushed. Production
launchd service (`com.davebuckley.calendar`) runs an older build — redeploy
per CLAUDE.md after pushing. One untracked file `scripts/prefix-calendar-emojis.mjs`
belongs to a separate automation — never commit or delete it. An uncommitted
TODO.md line is Dave's own note — leave it.

Quality baseline: 218 Jest tests green; `npx tsc --noEmit` has exactly 18
pre-existing error lines (all in old `src/__tests__` fixtures) — add zero new;
`npm run build` green. Commit trailer: `Co-Authored-By: Claude Fable 5
<noreply@anthropic.com>`. Don't push unless asked.

Key files:
- Worker: `workers/orchestrator/` — `orchestrator.ts` (runOnce), `claude-runner.ts`
  (spawns claude -p; change `--output-format json` → `stream-json --verbose`, tee
  to trace file, keep the report-extraction logic), `planner-client.ts` (HTTP to the
  app), `config.ts` (allowlist lives here — keep no-Bash), `status.ts`
  (PID/heartbeat lock — reuse for both execution paths).
- Queue store: extend `src/lib/user-data-storage.ts` + `src/types/index.ts`
  following the `taskMetadata` pattern (added Phase 1); API route pattern in
  `src/app/api/user-data/*`.
- UI: `src/components/dashboard/DelegationWidget.tsx`, delegate action + dialog in
  `src/components/AsanaSidebar.tsx`, client fns in `src/lib/api.ts`, status route
  `src/app/api/orchestrator/status/route.ts`.
- Paths: add new data-file constants to `src/lib/data-paths.ts`
  (`~/.claude/data/calendar/`).
- launchd: `scripts/launchd/com.davebuckley.calendar-orchestrator.plist` +
  `scripts/orchestrator-run.sh` + `scripts/install-orchestrator.sh` (pacer keeps
  this but the interval/logic changes; service was never installed/loaded).
- Detached spawn ("Run now") happens in a Next.js route — child must be spawned
  detached/unref'd with output to the trace file, NOT awaited in the request.
