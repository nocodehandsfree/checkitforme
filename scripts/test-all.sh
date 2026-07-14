#!/usr/bin/env bash
# Run every test suite and summarize. Usage: bash scripts/test-all.sh
set -uo pipefail
cd "$(dirname "$0")/.."
TSX=./node_modules/.bin/tsx
ENV="ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test ELEVENLABS_PHONE_NUMBER_ID=test"
FAILED=""

run(){ # label, command
  echo ""; echo "▭▭▭ $1 ▭▭▭"
  if eval "$2"; then echo "   → $1 OK"; else echo "   → $1 FAILED"; FAILED="$FAILED $1"; fi
}

echo "═══ Check — full test run ═══"
run "typecheck"        "npx tsc --noEmit"
run "unit: ratelimit"  "env DATABASE_URL=file:./.t-rl.db $ENV $TSX scripts/test-ratelimit.ts; rm -f .t-rl.db"
run "unit: r2 presign" "$ENV $TSX scripts/test-r2.ts"
run "unit: recipe"     "$ENV $TSX scripts/test-recipe.ts"
run "unit: geo"        "$ENV $TSX scripts/test-geo.ts"
run "unit: store-hours(cov)" "$ENV $TSX scripts/test-storehours.ts"
run "unit: brands"     "$ENV $TSX scripts/test-brands.ts"
run "unit: prompts"    "$ENV $TSX scripts/test-prompts.ts"
run "unit: stores-import" "$ENV $TSX scripts/test-storesimport.ts"
run "unit: security-checks" "$ENV $TSX scripts/test-securitychecks.ts"
run "unit: bridge"     "$ENV $TSX scripts/test-bridge.ts"
run "unit: tree-learn" "$ENV $TSX scripts/test-treelearn.ts"
run "unit: best-bet"   "$ENV $TSX scripts/test-bestbet.ts"
run "unit: store-hours" "$ENV $TSX scripts/test-store-hours.ts"
run "unit: schedules"  "env DATABASE_URL=file:./.t-sch.db $ENV $TSX scripts/test-schedules.ts; rm -f .t-sch.db"
run "unit: referrals"  "env DATABASE_URL=file:./.t-ref.db $ENV $TSX scripts/test-referrals.ts; rm -f .t-ref.db"
run "unit: receipt"    "$ENV $TSX scripts/test-receipt.ts"
  run "unit: auth/billing" "env DATABASE_URL=file:./.t-auth.db $ENV $TSX scripts/test-auth.ts; rm -f .t-auth.db"
run "unit: stripe billing" "env DATABASE_URL=file:./.t-stripe.db STRIPE_WEBHOOK_SECRET=whsec_test $ENV $TSX scripts/test-stripe.ts; rm -f .t-stripe.db"
run "unit: plans + entitlements" "env DATABASE_URL=file:./.t-plans.db $ENV $TSX scripts/test-plans.ts; rm -f .t-plans.db"
run "unit: store-sync"  "env DATABASE_URL=file:./.t-sync.db $ENV $TSX scripts/test-storesync.ts; rm -f .t-sync.db"
run "smoke: zones endpoints" "env DATABASE_URL=file:./.t-zones.db PORT=8791 $ENV $TSX scripts/test-zones-endpoints.ts; rm -f .t-zones.db"
run "smoke: support endpoints" "env DATABASE_URL=file:./.t-support.db PORT=8794 ADMIN_TOKEN=t $ENV $TSX scripts/test-support-endpoints.ts; rm -f .t-support.db"
run "smoke: admin user view" "env DATABASE_URL=file:./.t-adminview.db PORT=8793 ADMIN_TOKEN=t $ENV $TSX scripts/test-admin-user-view.ts; rm -f .t-adminview.db"
run "integration: growth/CMS/community" "bash scripts/test-growth.sh"
run "qa: pages (behavior benchmark)" "bash scripts/qa-pages.sh"
run "qa: design tokens (v2 skin)" "$TSX scripts/qa-design.ts"
run "qa: browser suites (v2 redesign)" "bash scripts/qa-browser.sh"

echo ""
echo "════════════════════════════════════════════════"
if [ -z "$FAILED" ]; then echo "  ✅ ALL SUITES PASSED"; exit 0
else echo "  ❌ FAILED:$FAILED"; exit 1; fi
