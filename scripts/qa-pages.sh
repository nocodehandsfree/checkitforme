#!/usr/bin/env bash
# qa-pages — BEHAVIOR BENCHMARK for the site-redesign loop (LOOP.md cycle 0a).
# Captures how the consumer site works BEFORE the redesign: every brand page must serve 200 and
# carry its critical behavior markers. The redesign changes look and copy, NEVER behavior — this
# suite must stay green all night. Boots the real server on a throwaway DB (test-growth.sh pattern).
set -uo pipefail
cd "$(dirname "$0")/.."

PORT=8798
DB="file:$(pwd)/test-qapages.db"
BASE="http://127.0.0.1:$PORT"
rm -f test-qapages.db
PASS=0; FAIL=0
ok(){ echo "  ✓ $1"; PASS=$((PASS+1)); }
no(){ echo "  ✗ $1"; FAIL=$((FAIL+1)); }
has(){ case "$2" in *"$3"*) ok "$1";; *) no "$1 — marker '$3' missing";; esac; }

echo "▶ qa-pages: booting server (port $PORT, fresh db)…"
DATABASE_URL="$DB" PORT=$PORT CLERK_ENFORCE=false \
  ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test ELEVENLABS_PHONE_NUMBER_ID=test \
  ./node_modules/.bin/tsx src/server.ts >/tmp/qa-pages.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; rm -f test-qapages.db' EXIT
for i in $(seq 1 40); do curl -fsS "$BASE/pub/policy" >/dev/null 2>&1 && break; sleep 0.5; done

# Every brand page: 200 + the full behavior marker set. (Apex "/" is HOST-routed — on localhost it
# serves the Admin app, so the four brand paths ARE the consumer surface here; staging's apex serves
# the same runner these paths do.)
for PAGE in "/pokemon" "/onepiece" "/toppsbasketball" "/needoh"; do
  CODE=$(curl -s -o /tmp/qa-page.html -w "%{http_code}" "$BASE$PAGE")
  if [ "$CODE" = "200" ]; then ok "GET $PAGE → 200"; else no "GET $PAGE → $CODE"; continue; fi
  HTML=$(cat /tmp/qa-page.html)
  has "$PAGE search input"        "$HTML" 'id="search"'
  has "$PAGE find-me (locate)"    "$HTML" 'findMe()'
  has "$PAGE radius slider"       "$HTML" 'id="rng"'
  has "$PAGE store list"          "$HTML" 'id="storelist"'
  has "$PAGE map view"            "$HTML" 'id="mapview"'
  has "$PAGE call flow (live)"    "$HTML" 'id="live"'
  has "$PAGE start-check handler" "$HTML" 'startCheckLive'
  has "$PAGE result view"         "$HTML" 'id="result"'
  has "$PAGE history calendar"    "$HTML" 'hcalwrap'
  has "$PAGE calendar month nav"  "$HTML" 'railCalMonth'
  has "$PAGE ES language table"   "$HTML" "'es'"
  has "$PAGE language switcher"   "$HTML" 'lsw_menu'
  has "$PAGE footer links"        "$HTML" 'foot-links'
  has "$PAGE brand switcher"      "$HTML" 'vsw_menu'
  has "$PAGE phone auth"          "$HTML" 'auth_phone'
done

# Consumer API surface the page depends on (shape smoke, not data):
ST=$(curl -s "$BASE/pub/store-types"); has "/pub/store-types serves" "$ST" '['
PS=$(curl -s "$BASE/pub/pokemon-sets"); has "/pub/pokemon-sets serves eras" "$PS" '"eras"'

echo "════════════════"
echo "  qa-pages PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" -eq 0 ]
