#!/usr/bin/env bash
# Boots the app in staging-sim mode (STAGING=1, calls disabled → simulated calls, nothing dials) and
# runs the live-call-view browser lock (scripts/test-live-view.mjs). Registered in test-all.sh.
set -uo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-8798}"
DB=".t-liveview.db"
CHROMIUM="${CHROMIUM_PATH:-/opt/pw-browsers/chromium}"
if [ ! -x "$CHROMIUM" ] && [ ! -f "$CHROMIUM" ]; then echo "SKIPPED: chromium not installed — live-view lock did not run"; exit 0; fi

env DATABASE_URL="file:./$DB" PORT="$PORT" ADMIN_TOKEN=t STAGING=1 \
  ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test ELEVENLABS_PHONE_NUMBER_ID=test \
  ./node_modules/.bin/tsx src/server.ts >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; rm -f "$DB"' EXIT

for i in $(seq 1 30); do
  curl -s -m 2 "http://127.0.0.1:$PORT/api/health" | grep -q ok && break
  sleep 2
done
curl -s -m 2 "http://127.0.0.1:$PORT/api/health" | grep -q ok || { echo "✗ server never came up"; exit 1; }

PORT="$PORT" node scripts/test-live-view.mjs
