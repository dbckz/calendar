# Delegation workflow redesign (proposal)

Status: advised 2026-07-12, not yet built. Build when Dave says go.

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
4. **Up to 10 minutes of dead air.** Tag a task, then wait for the next
   launchd tick. No "go now", no feedback that anything picked it up.

## Proposed changes

### 1. Compose the brief at delegate time
Clicking "Delegate to agent" opens a modal pre-filled from the task (title,
notes, task metadata) where you write/edit the instruction in plain English.
No magic syntax.

### 2. App-owned briefs, not Asana descriptions
Store briefs in the app's user-data store keyed by Asana task GID. The worker
fetches its queue from a new `/api/orchestrator/queue` endpoint instead of
parsing descriptions. The `agent_ready` / `agent_in_progress` /
`agent_complete` tags stay for visibility inside Asana, but become status
decoration rather than the protocol. Briefs can then be long, edited, or
private without polluting the task description, and the fragile parsing goes
away.

### 3. Full results rendered in-app
The worker stores the complete markdown report per run; the task dialog and
the Delegation widget render it. The Asana comment is still posted as the
permanent record.

### 4. "Run now"
A server route calls `launchctl start com.davebuckley.calendar-orchestrator`
when you delegate (or from a button in the widget), so the worker fires within
seconds instead of waiting for the interval. The existing stale-lock handling
(PID + heartbeat) already makes overlapping starts safe.

## Net effect

Delegation becomes: *type what you want → watch it run → read the result*,
all inside the dashboard, with Asana as the record rather than the interface.

## Related decisions already implemented

- Runner is headless Claude Code (`claude -p --output-format json`) with an
  explicit `--allowedTools` allowlist (Skill, Read, Write, WebSearch,
  WebFetch, claude.ai MCP connectors) — deliberately no Bash and no
  `--dangerously-skip-permissions`.
- `~skill-name` containers map to "use your `<name>` skill", so existing
  skills (event-cheat-sheet, meeting-briefing, …) are delegable.

## Sizing

Roughly one Phase-2-sized chunk: new user-data store + queue endpoint, worker
change to consume it, compose modal, report rendering, run-now route.
