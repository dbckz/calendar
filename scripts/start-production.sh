#!/bin/bash

# Calendar App Production Startup Script
# Finds an available port, updates Caddy config, and starts the Next.js app

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT_FILE="$APP_DIR/.data/current-port"
CADDY_APPS="$HOME/.caddy-apps"
CADDY_APPS_CONF="$CADDY_APPS/apps.conf"
PREFERRED_PORT=3001

mkdir -p "$APP_DIR/.data"

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

PORT=$(find_available_port $PREFERRED_PORT)
if [ -z "$PORT" ]; then
    echo "ERROR: Could not find an available port" >&2
    exit 1
fi

echo $PORT > "$PORT_FILE"
echo "Starting calendar app on port $PORT"

# Update caddy-apps config if the port changed from the registered value
if [ -f "$CADDY_APPS_CONF" ]; then
    REGISTERED_PORT=$(grep "^calendar=" "$CADDY_APPS_CONF" | cut -d'=' -f2 | xargs)
    if [ "$REGISTERED_PORT" != "$PORT" ]; then
        sed -i '' "s/^calendar=.*/calendar=$PORT/" "$CADDY_APPS_CONF"
        "$CADDY_APPS/caddy-apps" reload 2>/dev/null && \
            echo "Updated Caddy config to proxy to port $PORT"
    fi
fi

cd "$APP_DIR"
exec npx next start -p $PORT
