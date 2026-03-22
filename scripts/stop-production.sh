#!/bin/bash

# Calendar App Stop Script

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$APP_DIR/.data/app.pid"
LOG_FILE="$APP_DIR/.data/app.log"

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 $PID 2>/dev/null; then
        echo "$(date): Stopping calendar app (PID: $PID)" >> "$LOG_FILE"
        kill $PID
        rm "$PID_FILE"
        echo "Calendar app stopped"
    else
        echo "Process not running, cleaning up PID file"
        rm "$PID_FILE"
    fi
else
    echo "No PID file found. App may not be running."
fi
