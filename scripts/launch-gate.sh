#!/usr/bin/env bash
# THE launch gate — one command that drives every user journey end to end in a real browser.
# Run it against staging BEFORE every promote, and against prod RIGHT AFTER.
#
#   bash scripts/launch-gate.sh            # full gate: local dial-side journeys + live staging journeys
#   bash scripts/launch-gate.sh staging    # live staging journeys only
#   bash scripts/launch-gate.sh local      # dial-side journeys only (throwaway server, no network writes)
#   bash scripts/launch-gate.sh prod       # read-only @safe subset against production + the Admin UI
#
# Journeys covered: signup · store find → call sheet · upgrade + pay (Stripe TEST 4242, real
# webhook) · scheduled check · zones · check → verdict + zone fire (local, calls hard-disabled) ·
# admin API + Admin UI · all four brand skins. NOTHING the gate does can dial a real store.
# ADMIN_TOKEN is self-fetched from Railway when RAILWAY_API_TOKEN is available.
set -uo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-full}"
PROJECT_ID="889e332c-30fe-46e9-a18e-d8de4f7523aa"
ENV_ID="7cbf9327-357a-415e-9031-d1609aead2b4"
SVC_STAGING="8165df7a-3bdf-41a5-bdce-24883633a096"
SVC_PROD="d363a982-e918-4433-b175-defe8faf0ec9"

fetch_admin_token() { # $1 = service id → prints ADMIN_TOKEN or nothing
  [ -z "${RAILWAY_API_TOKEN:-}" ] && return 0
  curl -s -X POST https://backboard.railway.app/graphql/v2 \
    -H "Authorization: Bearer $RAILWAY_API_TOKEN" -H "Content-Type: application/json" \
    -d "{\"query\":\"{ variables(projectId: \\\"$PROJECT_ID\\\", environmentId: \\\"$ENV_ID\\\", serviceId: \\\"$1\\\") }\"}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['variables'].get('ADMIN_TOKEN',''))" 2>/dev/null
}

if ! node -e "import('@playwright/test')" >/dev/null 2>&1; then
  echo "✗ @playwright/test not installed — run: pnpm install" >&2; exit 1
fi

FAILED=""
run_target() { # $1 = target, extra env via $2
  echo ""; echo "════ launch-gate: $1 ════"
  if eval "env E2E_TARGET=$1 ${2:-} npx playwright test"; then echo "→ $1 PASSED"
  else echo "→ $1 FAILED"; FAILED="$FAILED $1"; fi
}

case "$MODE" in
  local) run_target local ;;
  staging)
    TOK="${ADMIN_TOKEN:-$(fetch_admin_token $SVC_STAGING)}"
    run_target staging "ADMIN_TOKEN='$TOK'"
    ;;
  prod)
    TOK="${ADMIN_TOKEN:-$(fetch_admin_token $SVC_PROD)}"
    run_target prod "ADMIN_TOKEN='$TOK' E2E_ADMIN_UI=1"
    ;;
  full)
    run_target local
    TOK="${ADMIN_TOKEN:-$(fetch_admin_token $SVC_STAGING)}"
    run_target staging "ADMIN_TOKEN='$TOK'"
    ;;
  *) echo "usage: bash scripts/launch-gate.sh [full|staging|local|prod]" >&2; exit 2 ;;
esac

echo ""; echo "════════════════════════════════"
if [ -z "$FAILED" ]; then echo "✅ LAUNCH GATE GREEN"; exit 0
else echo "❌ LAUNCH GATE RED:$FAILED"; exit 1; fi
