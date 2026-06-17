#!/usr/bin/env bash
# Interactive end-to-end smoke test for the phone-first auth + caller-ID flow against a LIVE deploy.
# Walks: SMS login → session → /app/me → (optional) caller-ID verification call.
# Usage:  bash scripts/smoke-auth.sh +13105551234 [https://checkitforme.com]
set -uo pipefail
PHONE="${1:-}"
BASE="${2:-https://checkitforme.com}"
[ -z "$PHONE" ] && { echo "usage: bash scripts/smoke-auth.sh +1XXXXXXXXXX [base_url]"; exit 1; }
j() { python3 -c 'import sys,json;d=json.load(sys.stdin);print(json.dumps(d,indent=2))' 2>/dev/null || cat; }

echo "▶ Base: $BASE   Phone: $PHONE"
echo ""
echo "1) Requesting SMS code …"
curl -s -m 20 -X POST "$BASE/auth/phone/start" -H "content-type: application/json" -d "{\"phone\":\"$PHONE\"}" | j
echo ""
read -rp "   Enter the 6-digit code you received: " CODE
echo ""
echo "2) Verifying code → creating session …"
RES=$(curl -s -m 20 -X POST "$BASE/auth/phone/check" -H "content-type: application/json" -d "{\"phone\":\"$PHONE\",\"code\":\"$CODE\"}")
echo "$RES" | j
TOKEN=$(echo "$RES" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))' 2>/dev/null)
[ -z "$TOKEN" ] && { echo "   ✗ no token — login failed. Stop."; exit 1; }
echo "   ✓ logged in (token captured)"
echo ""
echo "3) GET /app/me (should show your account: credits, comp, phone, callerIdReady) …"
curl -s -m 20 "$BASE/app/me" -H "Authorization: Bearer $TOKEN" | j
echo ""
read -rp "4) Run the caller-ID verification CALL now? (y/N) " GO
if [ "$GO" = "y" ] || [ "$GO" = "Y" ]; then
  echo "   Starting caller-ID verify — Twilio will CALL $PHONE; enter the code it shows below."
  curl -s -m 20 -X POST "$BASE/auth/callerid/start" -H "Authorization: Bearer $TOKEN" | j
  echo "   Answer the call, key in the validationCode above, then press Enter here to check status…"
  read -r _
  for i in 1 2 3 4 5; do
    echo "   poll $i: $(curl -s -m 20 "$BASE/auth/callerid/status" -H "Authorization: Bearer $TOKEN")"
    sleep 3
  done
  echo "   → verified:true means future checks will dial AS $PHONE. Re-run /app/me to see callerIdReady:true."
fi
echo ""
echo "✅ Smoke test done."
