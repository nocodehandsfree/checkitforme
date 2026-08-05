#!/usr/bin/env bash
# Run every test suite and summarize. Usage: bash scripts/test-all.sh
set -uo pipefail
cd "$(dirname "$0")/.."
TSX=./node_modules/.bin/tsx
ENV="ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test ELEVENLABS_PHONE_NUMBER_ID=test GEMINI_API_KEY=test OPENAI_API_KEY=test GROQ_API_KEY=test ANTHROPIC_API_KEY=test"
FAILED=""

# Self-cleanup (owner 07-20): the smoke/qa suites boot local servers + headless browsers. On ANY exit
# — pass, fail, or Ctrl-C — tear them down so nothing is ever orphaned to burn compute. (An OOM SIGKILL
# can't be trapped; for that, and for a small change, run ONE relevant unit test, not this whole suite.)
trap 'bash scripts/kill-tests.sh >/dev/null 2>&1 || true' EXIT INT TERM

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
run "GATES: one ear · every dial writes a receipt · no audio stored" "$ENV $TSX scripts/test-runtime-gates.ts"
run "SPEC, statement by statement" "env DATABASE_URL=file:./.t-sp.db $ENV $TSX scripts/test-spec-line-by-line.ts; rm -f .t-sp.db"
run "drive: Delta asks, the agent joins" "$ENV $TSX scripts/test-delta-clip.ts"
run "unit: runtime spec (segments · brain · outcome)" "env DATABASE_URL=file:./.t-rs.db $ENV $TSX scripts/test-runtime-spec.ts; rm -f .t-rs.db"
run "db: the dropped call charges nobody" "env DATABASE_URL=file:./.t-dc.db $ENV $TSX scripts/test-dropped-call.ts; rm -f .t-dc.db"
run "unit: delta"      "$ENV $TSX scripts/test-delta.ts"
run "unit: one question, then wrap (live agent)" "$ENV $TSX scripts/test-one-question.ts"
run "db: the transcript we recorded is the one shown" "env DATABASE_URL=file:./.t-tr.db $ENV $TSX scripts/test-transcript-owner.ts; rm -f .t-tr.db"
run "unit: workflow truth (Admin → call)" "env DATABASE_URL=file:./.t-wt.db $ENV $TSX scripts/test-workflow-truth.ts; rm -f .t-wt.db"
run "unit: call-reasons" "$ENV $TSX scripts/test-callreasons.ts"
run "unit: concurrency governor" "env DATABASE_URL=file:./.t-conc.db $ENV $TSX scripts/test-concurrency.ts; rm -f .t-conc.db"
run "unit: check queue feed" "env DATABASE_URL=file:./.t-q.db $ENV $TSX scripts/test-queue.ts; rm -f .t-q.db"
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
# The five mapping rigs (round-2 item 13: they ran in NOTHING before this line).
run "map: the one judge (recording or person)" "env DATABASE_URL=file:./.t-judge.db $ENV $TSX scripts/test-voice-judge.ts; rm -f .t-judge.db"
run "map: whole-life simulation" "env DATABASE_URL=file:./.t-mapsim.db $ENV $TSX scripts/test-map-sim.ts; rm -f .t-mapsim.db"
run "map: run survives a restart" "env DATABASE_URL=file:./.t-mapresume.db $ENV $TSX scripts/test-mapper-resume.ts; rm -f .t-mapresume.db"
run "map: the versioned map" "env DATABASE_URL=file:./.t-mapgraph.db $ENV $TSX scripts/test-mapgraph.ts; rm -f .t-mapgraph.db"
run "map: admin endpoints" "env DATABASE_URL=file:./.t-mapapi.db PORT=8798 ADMIN_TOKEN=t $ENV $TSX scripts/test-map-api.ts; rm -f .t-mapapi.db"
run "map: end to end" "env DATABASE_URL=file:./.t-mape2e.db PORT=8797 ADMIN_TOKEN=t $ENV $TSX scripts/test-map-e2e.ts; rm -f .t-mape2e.db"
run "smoke: zones endpoints" "env DATABASE_URL=file:./.t-zones.db PORT=8791 $ENV $TSX scripts/test-zones-endpoints.ts; rm -f .t-zones.db"
run "smoke: support endpoints" "env DATABASE_URL=file:./.t-support.db PORT=8794 ADMIN_TOKEN=t $ENV $TSX scripts/test-support-endpoints.ts; rm -f .t-support.db"
run "unit: credit machine" "env DATABASE_URL=file:./.t-credits.db $ENV $TSX scripts/test-credit-machine.ts; rm -f .t-credits.db"
run "smoke: admin user view" "env DATABASE_URL=file:./.t-adminview.db PORT=8793 ADMIN_TOKEN=t $ENV $TSX scripts/test-admin-user-view.ts; rm -f .t-adminview.db"
run "smoke: thrift opt-in" "env DATABASE_URL=file:./.t-thrift.db PORT=8795 $ENV $TSX scripts/test-thrift-optin.ts; rm -f .t-thrift.db"
run "smoke: admin UI ship path" "env DATABASE_URL=file:./.t-uidep2.db PORT=8792 ADMIN_TOKEN=t RAILWAY_VOLUME_MOUNT_PATH=./.t-vol $ENV $TSX scripts/test-admin-ui-deploy.ts; rm -rf .t-uidep2.db .t-vol"
run "smoke: settings sync" "env DATABASE_URL=file:./.t-setsync.db PORT=8788 ADMIN_TOKEN=t $ENV $TSX scripts/test-settings-sync.ts; rm -f .t-setsync.db"
run "integration: growth/CMS/community" "bash scripts/test-growth.sh"
run "qa: pages (behavior benchmark)" "bash scripts/qa-pages.sh"
run "qa: design tokens (v2 skin)" "$TSX scripts/qa-design.ts"
run "qa: admin sheet-glass LOCK (variant H)" "node scripts/qa-admin-glass.mjs"
run "qa: admin unify gate (sealed pages)" "node scripts/qa-admin-unify.mjs"
run "qa: site sheet-glass LOCK (variant H)" "node scripts/qa-site-glass.mjs"
run "qa: iOS chrome-tint LOCK" "node scripts/qa-tint-lock.mjs"
run "qa: check status page LOCK" "node scripts/qa-checkpage-lock.mjs"
run "qa: browser suites (v2 redesign)" "bash scripts/qa-browser.sh"
run "qa: live call view LOCK (sim)" "env PORT=8798 bash scripts/test-live-view.sh"

echo ""
echo "════════════════════════════════════════════════"
if [ -z "$FAILED" ]; then echo "  ✅ ALL SUITES PASSED"; exit 0
else echo "  ❌ FAILED:$FAILED"; exit 1; fi
