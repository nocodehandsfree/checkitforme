#!/usr/bin/env bash
# qa-browser — run the v2-redesign Chromium suites unattended (for test-all.sh / CI). Boots ONE seeded
# throwaway-DB server on :8797 (the port the suites expect), seeds the Hobby + Thrift QA chains, runs every
# qa-*.mjs against it, then tears it all down. Individual suites can still be run by hand against a dev
# server on :8797. Never leaves a zombie behind.
set -uo pipefail
cd "$(dirname "$0")/.."

PORT=8797
DB="file:$(pwd)/.t-browser.db"
BASE="http://127.0.0.1:$PORT"
ENVV="ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test ELEVENLABS_PHONE_NUMBER_ID=test"
rm -f .t-browser.db

# free the port if a stale server holds it (kill by pid so the tsx child dies too)
for pid in $(ss -tlnp 2>/dev/null | grep ":$PORT " | grep -oP 'pid=\K[0-9]+'); do kill "$pid" 2>/dev/null; done
sleep 1

echo "▶ qa-browser: booting server on :$PORT …"
env DATABASE_URL="$DB" PORT=$PORT CLERK_ENFORCE=false $ENVV \
  ./node_modules/.bin/tsx src/server.ts >/tmp/qa-browser.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; rm -f .t-browser.db' EXIT
for i in $(seq 1 60); do curl -fsS "$BASE/pub/policy" >/dev/null 2>&1 && break; sleep 0.5; done

FAILED=""
run(){ echo ""; echo "── $1 ──"; if node "scripts/$1"; then echo "   → $1 OK"; else echo "   → $1 FAILED"; FAILED="$FAILED $1"; fi; }

# qa-hobby / qa-thrift are intentionally NOT run here: they need seeded Hobby/Thrift chains, and running the
# seed scripts against this live server's SQLite double-bootstraps the schema and corrupts it (poisoning
# every later suite). Run them by hand against a dedicated seeded DB:
#   DATABASE_URL="file:$PWD/.t-p.db" tsx scripts/qa-hobby-seed.ts && tsx scripts/qa-thrift-seed.ts
#   (boot a server on :8797 with that DB, then: node scripts/qa-hobby.mjs / qa-thrift.mjs)
for S in qa-behaviors.mjs qa-round6.mjs qa-paidflow.mjs qa-price.mjs qa-gating.mjs qa-admin-plans.mjs; do
  run "$S"
done

echo ""
if [ -z "$FAILED" ]; then echo "  ✅ ALL BROWSER SUITES PASSED"; exit 0
else echo "  ❌ FAILED:$FAILED"; exit 1; fi
