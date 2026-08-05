#!/usr/bin/env bash
# promote = merge verified staging -> main (production). The ONLY way prod changes.
# The verification gate below exists so prod ships on PM's PROOF it works, never on
# the owner's word. See CLAUDE.md "PM is the gate before the owner — and before prod."
set -euo pipefail
cd "$(dirname "$0")/.."

echo "── gates ──"
npx tsc --noEmit
node scripts/check-store-contract.mjs

echo "── GitHub test gate (owner's rule, 2026-08-04) ──"
# GitHub runs the whole test suite on every push to staging. Promote REFUSES unless that
# run is green on the exact staging code being shipped. This reads the grade GitHub
# already made — it never re-runs the tests.
git fetch origin staging main
SHA="$(git rev-parse origin/staging)"
CHECKS_JSON="$(mktemp)"
HTTP_CODE="$(curl -s -o "$CHECKS_JSON" -w '%{http_code}' \
  -H "Accept: application/vnd.github+json" \
  ${GITHUB_TOKEN:+-H "Authorization: Bearer $GITHUB_TOKEN"} \
  "https://api.github.com/repos/nocodehandsfree/checkitforme/commits/$SHA/check-runs" || echo 000)"
if [ "$HTTP_CODE" = "200" ]; then
  CI_VERDICT="$(python3 - "$CHECKS_JSON" <<'PYEOF'
import json, sys
runs = json.load(open(sys.argv[1])).get("check_runs", [])
if not runs:
    print("none"); raise SystemExit
bad = [r["name"] for r in runs if r.get("conclusion") not in ("success", "skipped", "neutral")]
pending = [r["name"] for r in runs if r.get("status") != "completed"]
if pending:
    print("pending: " + ", ".join(pending))
elif bad:
    print("red: " + ", ".join(bad))
else:
    print("green")
PYEOF
)"
  case "$CI_VERDICT" in
    green)
      echo "✅ GitHub's test run is GREEN for $SHA." ;;
    none)
      echo "❌ GitHub has no test run yet for $SHA (it starts within a minute of a push)."
      echo "   Wait for the green check on the staging branch, then run promote again."
      rm -f "$CHECKS_JSON"; exit 1 ;;
    pending:*)
      echo "❌ GitHub is still running the tests for $SHA (${CI_VERDICT#pending: })."
      echo "   Wait for the green check, then run promote again."
      rm -f "$CHECKS_JSON"; exit 1 ;;
    *)
      echo "❌ GitHub's test run FAILED for $SHA (${CI_VERDICT#red: })."
      echo "   Nothing ships while the mark is red. Fix staging first."
      rm -f "$CHECKS_JSON"; exit 1 ;;
  esac
else
  echo "⚠ Could not reach GitHub to read the test mark (HTTP $HTTP_CODE)."
  echo "  Open the staging branch on github.com and look at the newest save yourself."
  if [ "${PROMOTE_CI_SEEN:-}" != "1" ]; then
    printf 'Type exactly "green" to confirm you SAW the green check on GitHub: '
    read -r CI_CONFIRM
    if [ "$CI_CONFIRM" != "green" ]; then
      echo "❌ Not confirmed — promote aborted. Nothing shipped."
      rm -f "$CHECKS_JSON"; exit 1
    fi
  fi
fi
rm -f "$CHECKS_JSON"

# "check" mode: prove the gates pass without promoting anything. Safe to run any time.
if [ "${1:-}" = "check" ]; then
  echo "✅ check mode: all promote gates pass. Nothing was shipped."
  exit 0
fi

echo "── verification gate ──"
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
