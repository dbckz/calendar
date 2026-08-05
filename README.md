# Personal Portal

(Still `dbckz/personal-portal` on GitHub — the repo rename is deferred.)

A personal portal organised into life areas: **Work** (the original command
center and weekly planner), **Exercise**, **Music**, and a cross-cutting
**Goals** area for monthly and quarterly goals.

The Work area pulls work from Google
Calendar, Asana, and Google Tasks into a single view, uses Claude-powered
classifiers to make sense of it, and schedules the week with a pure scheduling
engine. A delegation orchestrator hands suitable tasks off to headless Claude
Code agents and paces them within usage limits.

Runs locally as a Next.js app behind Caddy at `portal.localhost`, kept alive by
a launchd service. `calendar.localhost` still resolves to the same app, so old
bookmarks keep working. A read-only mobile view is served for the phone.

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
- **Life areas.** A section bar above the tabs switches between Work, Exercise,
  Music and Goals; each section owns its sub-tabs. The section list is data
  (`src/lib/life-sections.ts`), so adding an area is a registry entry.
- **Exercise.** Sessions are logged at EXERCISE level (sets, reps, weight,
  notes), which is what makes per-lift progression possible
  (`src/lib/exercise-progression.ts`). Plus volume/adherence/streak analysis and
  rule-based suggestions (`src/lib/exercise-analysis.ts`).
  - **Plan lives on the calendar.** Planned sessions are the all-day events on
    the personal Google calendar ("🏋️ Push (shoulders) + Run (2 km)"). The sync
    is two-way: planning in the portal writes the event, and pulling reads
    changes back (`src/lib/exercise-calendar.ts`). Keyed on the Google event id,
    so it reconciles rather than duplicating. An errand wearing the same emoji
    ("🏋️ Change gym membership") is excluded by requiring a training word.
  - **Session targets.** "Aim for today" recommends weight/reps per exercise
    using DOUBLE PROGRESSION rather than a fixed weekly increment: hit the reps
    with effort to spare, then the weight goes up. Effort is read out of the
    notes already written in the log ("could have done 3-4 more per set" → ~3.5
    reps in reserve), so the recommendation follows how the session actually
    felt (`src/lib/exercise-targets.ts`). Every row shows its reasoning.
  - **Training log import.** The historical spreadsheet imports via
    `POST /api/exercise/import-sheet`, which takes the sheet's content (the
    app's Google token only has `drive.file`, so it cannot read a pre-existing
    sheet). Idempotent, keyed `sheet:<date>`. Parsers keep the original text
    beside the parsed figures — see `src/lib/exercise-parse.ts`.
- **Monthly & quarterly goals.** Goals are section-scoped, monthly goals nest
  under quarterly ones, and progress is auto-derived where possible — from an
  Asana project, a calendar time-tracking category, or the exercise log
  (`src/lib/goal-evidence.ts`). Pacing compares actual against a straight line
  through the period (`src/lib/goal-progress.ts`).
- **Reflection & planning sessions.** Guided monthly/quarterly close-out and
  goal-setting flows, seeded by an evidence-derived scorecard
  (`src/components/goals/`).
- **Goal tracking in the rituals.** A check-in step rides along with the
  end-of-week review, a goal-alignment step sits in the plan-my-week wizard, and
  a Command Center card nudges about goals past halfway with nothing to show.

## Architecture

- **Next.js 16 App Router app** (`src/app`) — UI plus API routes under
  `src/app/api` for calendar, Asana, tasks, scheduling, dashboard, settings,
  and orchestrator status/traces.
- **Pure scheduling engine** (`src/lib/scheduling/`) — no I/O; takes gathered
  inputs (events, tasks, quotas, rituals) and produces a proposed plan. This is
  the heavily-tested core (`gather` → `engine` → `replan`/`reset`/`confirm`).
- **Integrations** (`src/lib/`) — `google-calendar.ts`, `google-tasks.ts`,
  `asana.ts`, with OAuth handled under `src/app/api/auth`.
- **JSON file storage** — persistent data lives in `~/.claude/data/portal/`
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

The app runs as a launchd service (`com.davebuckley.portal`) behind Caddy at
`https://portal.localhost` (and, for old bookmarks, `https://calendar.localhost`).
After pushing changes, rebuild and restart:

```bash
npm run build && launchctl stop com.davebuckley.portal && launchctl start com.davebuckley.portal
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

Persistent data lives in `~/.claude/data/portal/` (see above). Files are
registered for the daily app-data backup via the `.backup` manifest in this
repo; the backup script discovers manifests automatically.
