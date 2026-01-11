#!/bin/bash

# Calendar App Production Startup Script
# Finds an available port, updates Caddy config, and starts the Next.js app

APP_DIR="/Users/davebuckley/github/dbckz/claude/calendar"
PORT_FILE="$APP_DIR/.data/current-port"
CADDYFILE="/opt/homebrew/etc/Caddyfile"
PREFERRED_PORT=3001

# Ensure .data directory exists
mkdir -p "$APP_DIR/.data"

# Function to find an available port starting from a base
find_available_port() {
    local port=$1
    while [ $port -lt 65535 ]; do
        if ! lsof -i :$port > /dev/null 2>&1; then
            echo $port
            return 0
        fi
        port=$((port + 1))
    done
    return 1
}

# Find available port starting from preferred port
PORT=$(find_available_port $PREFERRED_PORT)
if [ -z "$PORT" ]; then
    echo "ERROR: Could not find an available port" >&2
    exit 1
fi

# Save the port for reference
echo $PORT > "$PORT_FILE"
echo "Starting calendar app on port $PORT"

# Update Caddy config if needed
if [ -f "$CADDYFILE" ]; then
    CURRENT_PORT=$(grep -A2 "calendar.local" "$CADDYFILE" | grep "reverse_proxy" | grep -oE '[0-9]+$')
    if [ "$CURRENT_PORT" != "$PORT" ]; then
        # Create temp file with updated port for calendar.local block only
        awk -v port="$PORT" '
            /calendar\.local/ { in_block=1 }
            in_block && /reverse_proxy/ { gsub(/localhost:[0-9]+/, "localhost:" port) }
            in_block && /^}/ { in_block=0 }
            { print }
        ' "$CADDYFILE" > "$CADDYFILE.tmp" && mv "$CADDYFILE.tmp" "$CADDYFILE"

        # Reload Caddy
        /opt/homebrew/bin/caddy reload --config "$CADDYFILE" 2>/dev/null && \
            echo "Updated Caddy config to proxy to port $PORT"
    fi
fi

# Change to app directory
cd "$APP_DIR"

# Start the app in foreground (launchd will manage the process)
exec npx next start -p $PORT
