#!/usr/bin/env bash
# Smoke/integration harness for the Growth/CMS Lego stack: policy, store CMS,
# kiosks, watches, finds privacy/headstart. Boots the server on a throwaway DB,
# hits the real HTTP endpoints, and asserts. No external services touched.
set -uo pipefail
cd "$(dirname "$0")/.."

PORT=8799
DB="file:$(pwd)/test-growth.db"
BASE="http://127.0.0.1:$PORT"
rm -f test-growth.db
PASS=0; FAIL=0
ok(){ echo "  ✓ $1"; PASS=$((PASS+1)); }
no(){ echo "  ✗ $1"; FAIL=$((FAIL+1)); }
# assert that haystack ($2) contains needle ($3); label $1
has(){ case "$2" in *"$3"*) ok "$1";; *) no "$1 — wanted '$3' in: $2";; esac; }

echo "▶ booting server (port $PORT, fresh db)…"
DATABASE_URL="$DB" PORT=$PORT CLERK_ENFORCE=false \
  ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test ELEVENLABS_PHONE_NUMBER_ID=test \
  ./node_modules/.bin/tsx src/server.ts >/tmp/test-growth.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; rm -f test-growth.db' EXIT
for i in $(seq 1 40); do curl -fsS "$BASE/pub/policy" >/dev/null 2>&1 && break; sleep 0.5; done

echo "▶ policy"
POL=$(curl -fsS "$BASE/pub/policy")
has "pub policy exposes perCallCents" "$POL" '"perCallCents"'
has "pub policy exposes packs"        "$POL" '"packs"'
has "pub policy exposes flags"        "$POL" '"flags"'
# dog-food hours must default OFF
FULL=$(curl -fsS "$BASE/api/policy")
has "dogfoodHours present"            "$FULL" '"dogfoodHours"'
case "$FULL" in *'"dogfoodHours":false'*) ok "dogfoodHours defaults OFF";; *) no "dogfoodHours should default false: $FULL";; esac

echo "▶ policy patch round-trips"
curl -fsS -X PATCH "$BASE/api/policy" -H 'content-type: application/json' \
  -d '{"pricing":{"perCallCents":30},"flags":{"scheduling":false}}' >/dev/null
POL2=$(curl -fsS "$BASE/api/policy")
has "perCallCents patched to 30" "$POL2" '"perCallCents":30'
has "scheduling flag patched off" "$POL2" '"scheduling":false'
# restore
curl -fsS -X PATCH "$BASE/api/policy" -H 'content-type: application/json' -d '{"pricing":{"perCallCents":25},"flags":{"scheduling":true}}' >/dev/null

echo "▶ store CMS import (region/timezone derivation)"
IMP=$(curl -fsS -X POST "$BASE/api/stores/import" -H 'content-type: application/json' -d '{"stores":[
  {"name":"Test Target — Austin","phone":"+15125550001","address":"1 Test Way, Austin TX","state":"TX","chain":"Target","carries":"Pokémon"},
  {"name":"Test Ralphs — LA","phone":"+13105550002","address":"2 Test Ave, LA CA","state":"CA","chain":"Ralphs","carries":"Pokémon","active":false}
]}')
has "import reports inserted" "$IMP" '"inserted"'
STORES=$(curl -fsS "$BASE/pub/stores")
has "imported TX store visible" "$STORES" 'Test Target'
has "TX store region derived (Southwest)" "$STORES" 'Southwest'
case "$STORES" in *"Test Ralphs"*) no "inactive store should be hidden from /pub/stores";; *) ok "inactive store soft-removed from /pub/stores";; esac

echo "▶ kiosk intel report → reward (anon free check)"
KIO=$(curl -fsS -X POST "$BASE/pub/kiosks/report" -H 'content-type: application/json' -d '{"label":"Test Albertsons — Sunset","minutes":["3","33"],"intervalMin":30,"contact":"tester@example.com"}')
has "kiosk report ok" "$KIO" '"ok":true'
has "anon reward freeCheck" "$KIO" '"freeCheck":true'
KLIST=$(curl -fsS "$BASE/api/kiosks")
has "kiosk summary computed" "$KLIST" ':03 & :33'

echo "▶ restock watch"
# need a real retailer + category id; grab the first imported store + first category
RID=$(curl -fsS "$BASE/pub/stores" | tr ',' '\n' | grep -m1 '"id"' | tr -dc '0-9')
CID=$(curl -fsS "$BASE/pub/categories" | tr ',' '\n' | grep -m1 '"id"' | tr -dc '0-9')
WAT=$(curl -fsS -X POST "$BASE/pub/watch" -H 'content-type: application/json' -d "{\"contact\":\"watch@example.com\",\"retailerId\":$RID,\"categoryId\":$CID}")
has "watch created" "$WAT" '"ok":true'
WLIST=$(curl -fsS "$BASE/api/watches")
has "watch listed" "$WLIST" 'watch@example.com'

echo "▶ restock intel aggregation"
INTEL=$(curl -fsS "$BASE/api/admin/restock-intel")
has "intel exposes totals"       "$INTEL" '"totals"'
has "intel exposes confirmRate"  "$INTEL" '"confirmRate"'
has "intel exposes shipmentDays" "$INTEL" '"shipmentDays"'
has "intel exposes topStores"    "$INTEL" '"topStores"'

echo "▶ growth pulse snapshot"
PULSE=$(curl -fsS "$BASE/api/admin/pulse")
has "pulse exposes funnel"    "$PULSE" '"funnel"'
has "pulse exposes activity"  "$PULSE" '"activity"'
has "pulse exposes community" "$PULSE" '"community"'

echo "▶ launch waitlist"
WLR=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/pub/waitlist" -H "content-type: application/json" -d "{\"contact\":\"wl@example.com\",\"lat\":34.1,\"lng\":-118.3}")
has "waitlist accepts a signup (200)" "$WLR" "200"
WLA=$(curl -fsS "$BASE/api/waitlist")
has "admin waitlist exposes total" "$WLA" "\"total\""

echo "▶ footer: store requests + content pages"
SR=$(curl -fsS -X POST "$BASE/pub/store-request" -H 'content-type: application/json' -d '{"storeName":"Target — Harness","city":"Austin, TX"}')
has "store request accepted" "$SR" '"ok":true'
has "store request listed (admin)" "$(curl -fsS "$BASE/api/store-requests")" 'Target — Harness'
has "policy exposes footer links" "$(curl -fsS "$BASE/pub/policy")" '"links"'
PG=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/p/privacy"); has "content page /p/privacy renders" "$PG" "200"
BADPG=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/p/nope"); has "unknown page 404s" "$BADPG" "404"

echo "▶ best-bet recommendation endpoint"
BB=$(curl -fsS "$BASE/pub/best-bet?lat=30.27&lng=-97.74&radius=50")
case "$BB" in '['*']') ok "best-bet returns a JSON array";; *) no "best-bet should return an array: $BB";; esac

echo "▶ rate limiting (kiosk reward bucket caps at 6/IP/hr)"
RL_HIT=0
for n in $(seq 1 9); do
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/pub/kiosks/report" -H 'content-type: application/json' -d '{"label":"Flood Test","minutes":["5"]}')
  [ "$code" = "429" ] && RL_HIT=1
done
[ "$RL_HIT" = "1" ] && ok "rapid kiosk reports eventually return 429" || no "expected a 429 after exceeding the reward limit"

echo "▶ community wall (flag-gated + moderated + host-locked)"
# OFF by default → empty feed, posting blocked
CFEED=$(curl -fsS "$BASE/pub/community")
case "$CFEED" in '[]') ok "community feed empty when flag off";; *) no "community feed should be [] when off: $CFEED";; esac
COFF=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/pub/community/post" -H 'content-type: application/json' -d '{"imageUrl":"/uploads/x.jpg"}')
has "post blocked (403) when community off" "$COFF" "403"
# turn it on + auto-approve for the test
curl -fsS -X PATCH "$BASE/api/policy" -H 'content-type: application/json' -d '{"flags":{"community":true,"communityAutoApprove":true}}' >/dev/null
# arbitrary remote image rejected (host-locked)
CBAD=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/pub/community/post" -H 'content-type: application/json' -d '{"imageUrl":"https://evil.example.com/x.jpg"}')
has "arbitrary remote image rejected (400)" "$CBAD" "400"
# our hosted path accepted
CPOST=$(curl -fsS -X POST "$BASE/pub/community/post" -H 'content-type: application/json' -d '{"imageUrl":"/uploads/score1.jpg","caption":"Pulled a Charizard!","handle":"ash"}')
has "hosted-image post accepted" "$CPOST" '"ok":true'
CFEED2=$(curl -fsS "$BASE/pub/community")
has "auto-approved post appears in feed" "$CFEED2" 'Charizard'
has "admin community list works" "$(curl -fsS "$BASE/api/community")" 'score1.jpg'
curl -fsS -X PATCH "$BASE/api/policy" -H 'content-type: application/json' -d '{"flags":{"community":false,"communityAutoApprove":false}}' >/dev/null

echo "▶ finds feed respects publicFeed flag"
curl -fsS -X PATCH "$BASE/api/policy" -H 'content-type: application/json' -d '{"finds":{"publicFeed":false}}' >/dev/null
FINDS=$(curl -fsS "$BASE/pub/finds")
case "$FINDS" in '[]') ok "finds feed empty when publicFeed=false";; *) no "finds feed should be [] when off: $FINDS";; esac
curl -fsS -X PATCH "$BASE/api/policy" -H 'content-type: application/json' -d '{"finds":{"publicFeed":true}}' >/dev/null

echo ""
echo "════════════════════════════════"
echo "  PASS: $PASS   FAIL: $FAIL"
echo "════════════════════════════════"
[ "$FAIL" -eq 0 ]
