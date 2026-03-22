#!/bin/bash

# Full setup script for the Calendar app on a new machine
# Usage: ./scripts/setup.sh

set -e

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CADDY_APPS="$HOME/.caddy-apps"
PORT=3001

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
DIM='\033[2m'
NC='\033[0m'

ok() { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; exit 1; }
step() { echo -e "\n${BLUE}[$1/$TOTAL]${NC} $2"; }
info() { echo -e "  ${DIM}$1${NC}"; }

TOTAL=6

echo ""
echo "========================================="
echo "  Calendar App Setup"
echo "========================================="

# 1. Check prerequisites
step 1 "Checking prerequisites..."
command -v node >/dev/null || fail "Node.js not found. Install with: brew install node"
info "node $(node --version)"
command -v npm >/dev/null || fail "npm not found. Install with: brew install node"
info "npm $(npm --version)"
command -v caddy >/dev/null || fail "Caddy not found. Install with: brew install caddy"
info "caddy $(caddy version 2>/dev/null | head -1)"
ok "All prerequisites installed"

# 2. Install dependencies
step 2 "Installing npm dependencies..."
cd "$APP_DIR"
npm install --silent 2>&1 | tail -1 || npm install
ok "Dependencies installed"

# 3. Create .env.local if missing
step 3 "Configuring environment..."
if [ ! -f "$APP_DIR/.env.local" ]; then
    cat > "$APP_DIR/.env.local" <<EOF
PORT=$PORT
APP_URL=https://calendar.localhost
EOF
    ok "Created .env.local (PORT=$PORT, URL=https://calendar.localhost)"
else
    ok ".env.local already exists"
fi
mkdir -p "$HOME/.claude/data/calendar" "$HOME/.claude/logs" "$APP_DIR/.data"
ok "Created data and log directories"

# 4. Bootstrap caddy-apps if missing, then register
step 4 "Setting up Caddy reverse proxy..."
if [ ! -f "$CADDY_APPS/caddy-apps" ]; then
    info "~/.caddy-apps/ not found, bootstrapping..."
    mkdir -p "$CADDY_APPS/logs"

    cp "$APP_DIR/scripts/caddy-apps" "$CADDY_APPS/caddy-apps"
    chmod +x "$CADDY_APPS/caddy-apps"
    ok "Installed caddy-apps manager to ~/.caddy-apps/"

    cat > "$CADDY_APPS/apps.conf" <<'CONF'
# Caddy Apps Configuration
# Format: name=port
# Access apps at https://name.localhost
#
# Port Allocation Guide:
#   3001-3010: Node.js/Next.js apps
#   5000-5099: Python Flask apps
#   8000-8099: Python FastAPI/other apps
CONF
    ok "Created apps.conf"

    info "Trusting Caddy CA for local HTTPS (may prompt for password)..."
    caddy trust 2>/dev/null || echo "  (Could not auto-trust CA — you may see HTTPS warnings)"
    ok "Caddy CA trusted"
else
    ok "~/.caddy-apps/ already set up"
fi

if ! grep -q "^calendar=" "$CADDY_APPS/apps.conf" 2>/dev/null; then
    "$CADDY_APPS/caddy-apps" add calendar $PORT
    ok "Registered calendar.localhost → localhost:$PORT"
else
    ok "calendar.localhost already registered"
fi

# 5. Build
step 5 "Building production bundle..."
BUILD_OUTPUT=$(npm run build 2>&1)
echo "$BUILD_OUTPUT" | while IFS= read -r line; do
    case "$line" in
        *"Creating"*|*"Generating"*|*"Collecting"*) info "$line" ;;
        *"○"*|*"ƒ"*|*"●"*) info "$line" ;;
    esac
done
ok "Production build complete"

# 6. Install launchd service
step 6 "Installing launchd service..."
"$APP_DIR/scripts/install-service.sh"
ok "Service installed and running"
info "Logs: ~/.claude/logs/calendar.log"
info "Stop:  launchctl stop com.davebuckley.calendar"
info "Start: launchctl start com.davebuckley.calendar"

echo ""
echo "========================================="
echo -e "  ${GREEN}Setup complete!${NC}"
echo ""
echo "  Visit: https://calendar.localhost"
echo "  Then connect Google Calendar and Asana."
echo "========================================="
echo ""
