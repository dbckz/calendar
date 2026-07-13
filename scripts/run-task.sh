#!/bin/bash

# "Run now" runner wrapper. Spawned detached by the /api/orchestrator/run-now
# route as `run-task.sh <asanaTaskGid>`. Mirrors orchestrator-run.sh's PATH setup
# (launchd/Next give no useful PATH; the headless `claude` binary lives in
# ~/.local/bin) then runs a single explicit task with tsx. cwd is the repo root
# so the worker's config can locate .data/current-port.

APP_DIR="${CALENDAR_APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:/usr/bin:/bin:$PATH"
export CALENDAR_APP_DIR="$APP_DIR"

cd "$APP_DIR"
exec npx tsx workers/orchestrator/run-task.ts "$1"
