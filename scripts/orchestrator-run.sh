#!/bin/bash

# Orchestrator worker runner (invoked by launchd on an interval).
# launchd provides no useful PATH, so we set one that includes Homebrew's node
# and ~/.local/bin (where the headless `claude` binary lives), then run a single
# pass of the orchestrator with tsx. cwd is the repo root so the worker's config
# can locate .data/current-port.

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:/usr/bin:/bin:$PATH"
export CALENDAR_APP_DIR="$APP_DIR"

# Pin the claude account (two accounts on this machine): honour CLAUDE_BIN from
# the environment, else read it from the gitignored .env.local. The worker's
# config.ts reads process.env.CLAUDE_BIN; tsx does not auto-load .env.local.
if [ -z "${CLAUDE_BIN:-}" ] && [ -f "$APP_DIR/.env.local" ]; then
    CLAUDE_BIN=$(grep -E '^CLAUDE_BIN=' "$APP_DIR/.env.local" | tail -1 | cut -d= -f2- || true)
fi
export CLAUDE_BIN

cd "$APP_DIR"
exec npx tsx workers/orchestrator/run.ts
