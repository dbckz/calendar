#!/bin/bash

# Personal Portal production startup script.
# Finds an available port, points Caddy at it, and starts the Next.js app.

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT_FILE="$APP_DIR/.data/current-port"
CADDY_APPS="$HOME/.caddy-apps"
PREFERRED_PORT=3001

# Match caddy-apps' own config resolution: each machine keeps its own
# apps.<user>.conf so two machines sharing the repo don't clobber each other's
# app list. Writing to the shared apps.conf when a per-machine file exists means
# editing a file nothing reads — which is how a port change could silently leave
# Caddy proxying to a dead port.
HOST_KEY="$(id -un)"
CADDY_APPS_CONF="$CADDY_APPS/apps.$HOST_KEY.conf"
[ -f "$CADDY_APPS_CONF" ] || CADDY_APPS_CONF="$CADDY_APPS/apps.conf"

# Every hostname this app is served under. `portal` is the current name;
# `calendar` is kept as an alias so old bookmarks keep working. Both must follow
# the port, or one of them breaks the moment the port moves.
APP_HOSTS=(portal calendar)

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
echo "Starting portal on port $PORT"

# Point every hostname at the port we actually got. A host missing from the
# config is added rather than skipped, so a fresh machine (or a newly added
# alias) becomes self-healing instead of silently unrouted.
if [ -f "$CADDY_APPS_CONF" ]; then
    CHANGED=0
    for HOST in "${APP_HOSTS[@]}"; do
        REGISTERED_PORT=$(grep "^${HOST}=" "$CADDY_APPS_CONF" | cut -d'=' -f2 | xargs)
        if [ -z "$REGISTERED_PORT" ]; then
            echo "${HOST}=${PORT}" >> "$CADDY_APPS_CONF"
            echo "Added ${HOST}.localhost -> ${PORT}"
            CHANGED=1
        elif [ "$REGISTERED_PORT" != "$PORT" ]; then
            sed -i '' "s/^${HOST}=.*/${HOST}=${PORT}/" "$CADDY_APPS_CONF"
            echo "Repointed ${HOST}.localhost -> ${PORT}"
            CHANGED=1
        fi
    done

    if [ "$CHANGED" = "1" ]; then
        # Reload once, after all the hosts are consistent.
        "$CADDY_APPS/caddy-apps" reload >/dev/null 2>&1 && \
            echo "Reloaded Caddy config ($(basename "$CADDY_APPS_CONF"))"
    fi
else
    echo "WARNING: no caddy-apps config at $CADDY_APPS_CONF — the app will only" >&2
    echo "         be reachable on http://localhost:$PORT" >&2
fi

cd "$APP_DIR"
exec npx next start -p $PORT
