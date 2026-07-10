#!/usr/bin/env bash
# promote = merge verified staging -> main (production). The ONLY way prod changes.
# Run AFTER the owner has verified the change on staging.checkitforme.com.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "── gates ──"
npx tsc --noEmit
node scripts/check-store-contract.mjs

echo "── promote staging → main ──"
git fetch origin staging main
git checkout main
git pull origin main
git merge --no-edit origin/staging
git push origin main
git checkout staging
echo "✅ promoted. Railway is deploying checkitforme.com — watch it come up, then verify /api/health."
