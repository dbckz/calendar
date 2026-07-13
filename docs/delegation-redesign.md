# Delegation workflow redesign (proposal)

Status: advised 2026-07-12, revised 2026-07-13 after discussing what the queue
is actually for. Not yet built. Build when Dave says go.

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

### 5. Full results rendered in-app
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
