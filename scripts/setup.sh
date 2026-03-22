#!/bin/bash

# Full setup script for the Calendar app on a new machine
# Usage: ./scripts/setup.sh

set -e

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CADDY_APPS="$HOME/.caddy-apps"
PORT=3001

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

ok() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }

echo "Setting up Calendar app..."
echo ""

# 1. Check prerequisites
command -v node >/dev/null || fail "Node.js not found. Install with: brew install node"
command -v npm >/dev/null || fail "npm not found. Install with: brew install node"
command -v caddy >/dev/null || fail "Caddy not found. Install with: brew install caddy"
ok "Prerequisites installed"

# 2. Install dependencies
cd "$APP_DIR"
npm install --silent
ok "npm dependencies installed"

# 3. Create .env.local if missing
if [ ! -f "$APP_DIR/.env.local" ]; then
    cat > "$APP_DIR/.env.local" <<EOF
PORT=$PORT
APP_URL=https://calendar.local
EOF
    ok "Created .env.local"
else
    ok ".env.local already exists"
fi

# 4. Bootstrap caddy-apps if missing, then register
if [ ! -f "$CADDY_APPS/caddy-apps" ]; then
    echo "Setting up caddy-apps system..."
    mkdir -p "$CADDY_APPS/logs"

    # Create the caddy-apps manager script
    cp "$APP_DIR/scripts/caddy-apps" "$CADDY_APPS/caddy-apps"
    chmod +x "$CADDY_APPS/caddy-apps"

    # Create minimal apps.conf
    cat > "$CADDY_APPS/apps.conf" <<'CONF'
# Caddy Apps Configuration
# Format: name=port
# Access apps at https://name.local
#
# Port Allocation Guide:
#   3001-3010: Node.js/Next.js apps
#   5000-5099: Python Flask apps
#   8000-8099: Python FastAPI/other apps
CONF

    # Trust the Caddy CA for local HTTPS
    caddy trust 2>/dev/null || echo "  (Could not auto-trust CA — you may see HTTPS warnings)"

    ok "Bootstrapped ~/.caddy-apps/"
fi

if ! grep -q "^calendar=" "$CADDY_APPS/apps.conf" 2>/dev/null; then
    "$CADDY_APPS/caddy-apps" add calendar $PORT
    ok "Registered calendar=$PORT in caddy-apps"
else
    ok "Already registered in caddy-apps"
fi

# 5. Build
npm run build --silent
ok "Production build complete"

# 6. Install launchd service
"$APP_DIR/scripts/install-service.sh"
ok "launchd service installed and running"

echo ""
echo "Setup complete! Visit https://calendar.local"
echo "You'll need to connect Google Calendar and Asana from the app."
