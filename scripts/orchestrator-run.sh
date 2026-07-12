#!/bin/bash

# Orchestrator worker runner (invoked by launchd on an interval).
# launchd provides no useful PATH, so we set one that includes Homebrew's node,
# then run a single pass of the orchestrator with tsx. cwd is the repo root so
# the worker's config can locate .data/current-port.

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export CALENDAR_APP_DIR="$APP_DIR"

cd "$APP_DIR"
exec npx tsx workers/orchestrator/run.ts
