#!/usr/bin/env bash
# promote = merge verified staging -> main (production). The ONLY way prod changes.
# The verification gate below exists so prod ships on PM's PROOF it works, never on
# the owner's word. See CLAUDE.md "PM is the gate before the owner — and before prod."
set -euo pipefail
cd "$(dirname "$0")/.."

echo "── gates ──"
npx tsc --noEmit
node scripts/check-store-contract.mjs

echo "── verification gate ──"
git fetch origin staging main
SHIPPING="$(git log origin/main..origin/staging --oneline)"
if [ -z "$SHIPPING" ]; then
  echo "Nothing to promote — main is already level with staging."
  exit 0
fi
echo "These commits ship to PRODUCTION (checkitforme.com) the moment you continue:"
echo "$SHIPPING" | sed 's/^/    /'
echo ""
echo "Each user-facing change above must have been DRIVEN on staging.checkitforme.com"
echo "(a real click/flow, not just green tests) and reported as a Done Report. The owner"
echo "is NOT the tester. If you cannot say that for every line, STOP and go verify."
# PROMOTE_VERIFIED=1 acknowledges the gate for scripted runs; interactive is the default.
if [ "${PROMOTE_VERIFIED:-}" != "1" ]; then
  printf 'Type exactly "verified" to confirm you drove these and proceed: '
  read -r CONFIRM
  if [ "$CONFIRM" != "verified" ]; then
    echo "❌ Not confirmed — promote aborted. Nothing shipped."
    exit 1
  fi
fi

echo "── promote staging → main ──"
git checkout main
git pull origin main
git merge --no-edit origin/staging
git push origin main
git checkout staging
echo "✅ promoted. Railway is deploying checkitforme.com — watch it come up, then verify /api/health."
