#!/bin/sh
set -eu

if command -v chromium >/dev/null 2>&1; then
  browser=chromium
elif command -v chromium-browser >/dev/null 2>&1; then
  browser=chromium-browser
else
  echo "Chromium is required for the Raspberry Pi kiosk player" >&2
  exit 1
fi

exec "$browser" \
  --app=http://127.0.0.1:8787/?display=1 \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble
