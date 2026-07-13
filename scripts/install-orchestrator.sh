#!/bin/bash

# Install the calendar orchestrator worker as a launchd agent.
# Resolves the plist template with machine-specific paths, installs it, and
# loads it. Safe to run multiple times (idempotent: unloads any prior copy
# first). Logs go to ~/.claude/logs/orchestrator.log.

set -e

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST_NAME="com.davebuckley.calendar-orchestrator"
TEMPLATE="$APP_DIR/scripts/launchd/$PLIST_NAME.plist"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"
LOG_DIR="$HOME/.claude/logs"

mkdir -p "$LOG_DIR" "$HOME/.claude/data/calendar" "$HOME/Library/LaunchAgents"

if [ ! -f "$TEMPLATE" ]; then
    echo "ERROR: plist template not found at $TEMPLATE" >&2
    exit 1
fi

# Substitute placeholders into the resolved plist.
sed -e "s|__APP_DIR__|$APP_DIR|g" \
    -e "s|__LOG_DIR__|$LOG_DIR|g" \
    "$TEMPLATE" > "$PLIST_PATH"

# Reload cleanly.
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo "Installed and loaded $PLIST_NAME"
echo "  plist:  $PLIST_PATH"
echo "  logs:   $LOG_DIR/orchestrator.log"
echo "  runs:   every 600s (StartInterval); agentPacing caps limit actual runs"
echo
echo "Trigger a one-off run now with:"
echo "  launchctl start $PLIST_NAME"
