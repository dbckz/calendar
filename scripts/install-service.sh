#!/bin/bash

# Install the calendar app as a launchd service
# Generates the plist with paths for the current user/machine

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST_NAME="com.davebuckley.calendar"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"
LOG_DIR="$HOME/.claude/logs"

# Ensure required directories exist
mkdir -p "$LOG_DIR"
mkdir -p "$HOME/.claude/data/calendar"
mkdir -p "$APP_DIR/.data"

# Unload existing service if present
launchctl unload "$PLIST_PATH" 2>/dev/null

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$PLIST_NAME</string>

    <key>ProgramArguments</key>
    <array>
        <string>$APP_DIR/scripts/start-production.sh</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>$LOG_DIR/calendar.log</string>

    <key>StandardErrorPath</key>
    <string>$LOG_DIR/calendar.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>

    <key>WorkingDirectory</key>
    <string>$APP_DIR</string>
</dict>
</plist>
EOF

echo "Installed plist to $PLIST_PATH"

# Load the service
launchctl load "$PLIST_PATH"
echo "Service loaded. Check status with: launchctl list | grep calendar"
