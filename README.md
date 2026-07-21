# Calendar

A personal command center and weekly planner. It pulls work from Google
Calendar, Asana, and Google Tasks into a single view, uses Claude-powered
classifiers to make sense of it, and schedules the week with a pure scheduling
engine. A delegation orchestrator hands suitable tasks off to headless Claude
Code agents and paces them within usage limits.

Runs locally as a Next.js app behind Caddy at `calendar.localhost`, kept alive
by a launchd service. A read-only mobile view is served for the phone.

## What it does

- **One view of the work.** Aggregates events, Asana tasks, and Google Tasks so
  planned work is visible in one place (`src/app`, `src/components`).
- **Plan-my-week wizard.** Allocates work types to weekly capacity using block
  quotas, grouped categories, rituals, and a set of scheduling rules
  (`src/lib/scheduling/`, `src/components/dashboard`).
- **Sprint rituals.** Backlog grooming, planning, retrospective, daily review,
  daily Kindle notes — driven off the same quota/ritual machinery
  (`src/lib/scheduling/rituals.ts`, `daily-review.ts`, `ritual-events.ts`).
- **Claude classifiers.** Type, priority, staleness, and prep classifiers
  enrich tasks so scheduling and ranking can be automatic
  (`src/lib/*-classifier.ts`, `task-ranking.ts`, `priority-matcher.ts`).
- **Delegation.** Suitable Asana tasks are queued and run by headless Claude
  Code agents; runs stream a structured trace the UI renders live
  (`workers/orchestrator/`, `src/components/DelegateModal.tsx`,
  `src/components/dashboard/DelegationWidget.tsx`).

## Architecture

- **Next.js 16 App Router app** (`src/app`) — UI plus API routes under
  `src/app/api` for calendar, Asana, tasks, scheduling, dashboard, settings,
  and orchestrator status/traces.
- **Pure scheduling engine** (`src/lib/scheduling/`) — no I/O; takes gathered
  inputs (events, tasks, quotas, rituals) and produces a proposed plan. This is
  the heavily-tested core (`gather` → `engine` → `replan`/`reset`/`confirm`).
- **Integrations** (`src/lib/`) — `google-calendar.ts`, `google-tasks.ts`,
  `asana.ts`, with OAuth handled under `src/app/api/auth`.
- **JSON file storage** — persistent data lives in `~/.claude/data/calendar/`
  (see `src/lib/data-paths.ts`): `user-data.json` (tasks, metadata, delegation
  queue), `integrations.json` (OAuth tokens), `workflow-config.json` (quotas,
  scheduling config), `time-tracking.json`, plus `orchestrator-status.json` and
  the per-run `agent-runs/` traces. Stored outside the repo so it survives
  builds and redeploys. The project-local `.data/` dir only holds the current
  dev/mobile port files.
- **Delegation orchestrator** (`workers/orchestrator/`) — a launchd-paced worker
  that drains the app's delegation queue at a sustainable rate. Each tick runs
  at most one task via `claude -p` with an explicit tool allowlist (no Bash),
  teeing the `stream-json` event stream to a per-run trace file. See
  `docs/delegation-redesign.md` for the design.

## Key directories

```
src/app/            Next.js pages + API routes (incl. /mobile phone view)
src/components/      React UI (dashboard/, sidebars, modals, timeline)
src/lib/             Integrations, classifiers, storage, data paths
src/lib/scheduling/  Pure scheduling engine (gather, engine, replan, rituals…)
src/hooks/          React hooks
src/types/          Shared types
workers/orchestrator/  Delegation pacer + claude -p runner
scripts/            launchd plists, install/run helpers
docs/               Vision and design notes
```

## Development

```bash
npm install
npm run dev          # Next.js dev server
npm test             # Jest
npx tsc --noEmit     # type check
npm run lint         # eslint
```

The orchestrator worker can be run once by hand: `npm run orchestrator:run`.

## Production

The app runs as a launchd service (`com.davebuckley.calendar`) behind Caddy at
`https://calendar.localhost`. After pushing changes, rebuild and restart:

```bash
npm run build && launchctl stop com.davebuckley.calendar && launchctl start com.davebuckley.calendar
```

## iPhone read-only app

The launchd service serves the phone view at `/mobile`. Find the current port:

```bash
cat .data/current-port
```

Open the Tailscale URL from the iPhone:

```text
http://<mac-tailscale-ip>:<port>/mobile
```

For this machine the Tailscale IP is currently `100.105.152.120`, so if
`.data/current-port` contains `3001` the URL is
`http://100.105.152.120:3001/mobile`. The mobile page is a phone view for
agenda browsing, event details, and completing reminders. In Safari, use
Share → Add to Home Screen to launch it like an app.

## Data & backup

Persistent data lives in `~/.claude/data/calendar/` (see above). Files are
registered for the daily app-data backup via the `.backup` manifest in this
repo; the backup script discovers manifests automatically.
