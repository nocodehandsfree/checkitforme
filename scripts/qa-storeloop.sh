#!/usr/bin/env bash
# qa-storeloop — end-to-end proof of the store-request FREE-CHECK reward loop + the shipped legal/info pages.
# A signed-in user submits a store → it's attributed to them → Admin marks it 'added' → the submitter is
# granted their free check ONCE (idempotent) → their balance goes up. Also asserts /p/* serve real content.
# Boots a throwaway server; no external deps. Exit non-zero on any failure.
set -uo pipefail
cd "$(dirname "$0")/.."
PORT=8796; DB="file:$(pwd)/.t-storeloop.db"; rm -f .t-storeloop.db
SECRET="test-session-secret-000000000000000000000000"
ENVV="ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test ELEVENLABS_PHONE_NUMBER_ID=test"
for pid in $(ss -tlnp 2>/dev/null | grep ":$PORT " | grep -oP 'pid=\K[0-9]+'); do kill "$pid" 2>/dev/null; done
sleep 1
env DATABASE_URL="$DB" PORT=$PORT CLERK_ENFORCE=false SESSION_SECRET="$SECRET" $ENVV ./node_modules/.bin/tsx src/server.ts >/tmp/qa-storeloop.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; rm -f .t-storeloop.db' EXIT
for i in $(seq 1 60); do curl -fsS "http://127.0.0.1:$PORT/pub/policy" >/dev/null 2>&1 && break; sleep 0.5; done

# Mint a real consumer session token (project-root file so './src/auth' resolves).
cat > .qa-storeloop-mint.ts <<'EOF'
import { signSession } from './src/auth';
signSession(process.argv[2], '+15550001111').then(t => process.stdout.write(t));
EOF
trap 'kill $SRV 2>/dev/null; rm -f .t-storeloop.db .qa-storeloop-mint.ts' EXIT
TOK=$(env SESSION_SECRET="$SECRET" $ENVV ./node_modules/.bin/tsx ./.qa-storeloop-mint.ts user_loopA)

FAILS=0
ck(){ if [ "$2" = "$3" ]; then echo "  ✓ $1"; else echo "  ✗ $1 (got '$2' want '$3')"; FAILS=$((FAILS+1)); fi; }
J(){ python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }

# Pages: real content, no "coming soon" in the primary body (help-line aside).
for slug in privacy terms faq about contact; do
  real=$(curl -s "http://127.0.0.1:$PORT/p/$slug?partial=1" | J "'yes' if len(d['body'])>300 else 'no'")
  ck "/p/$slug serves real content" "$real" "yes"
done

C0=$(curl -s "http://127.0.0.1:$PORT/app/me" -H "Authorization: Bearer $TOK" | J "d.get('credits')")
ck "new account starts at 0 credits" "$C0" "0"
curl -s -X POST "http://127.0.0.1:$PORT/pub/store-request" -H "Authorization: Bearer $TOK" -H "content-type: application/json" -d '{"storeName":"Fungie Cards","city":"Thousand Oaks, CA"}' >/dev/null
ID=$(curl -s "http://127.0.0.1:$PORT/app/my-store-requests" -H "Authorization: Bearer $TOK" | J "d['requests'][0]['id']")
ST=$(curl -s "http://127.0.0.1:$PORT/app/my-store-requests" -H "Authorization: Bearer $TOK" | J "d['requests'][0]['status']")
ck "submission is attributed + pending" "$ST" "new"
GR=$(curl -s -X PATCH "http://127.0.0.1:$PORT/api/store-requests/$ID" -H "content-type: application/json" -d '{"status":"added"}' | J "(d.get('granted') or {}).get('checks')")
ck "approve grants the reward" "$GR" "1"
RW=$(curl -s "http://127.0.0.1:$PORT/app/my-store-requests" -H "Authorization: Bearer $TOK" | J "d['requests'][0]['rewarded']")
ck "request marked rewarded" "$RW" "True"
C1=$(curl -s "http://127.0.0.1:$PORT/app/me" -H "Authorization: Bearer $TOK" | J "d.get('credits')")
ck "submitter balance went up by 1" "$C1" "1"
GR2=$(curl -s -X PATCH "http://127.0.0.1:$PORT/api/store-requests/$ID" -H "content-type: application/json" -d '{"status":"added"}' | J "(d.get('granted') or {}).get('checks')")
ck "re-approve does NOT double-grant" "$GR2" "None"
C2=$(curl -s "http://127.0.0.1:$PORT/app/me" -H "Authorization: Bearer $TOK" | J "d.get('credits')")
ck "balance unchanged after re-approve" "$C2" "1"

echo ""
if [ "$FAILS" = "0" ]; then echo "  ✅ ALL STORE-LOOP TESTS PASS"; exit 0; else echo "  ❌ $FAILS FAILED"; exit 1; fi
