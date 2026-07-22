#!/usr/bin/env bash
# verify-live.sh — proof of what each site is ACTUALLY serving (REBUILD_PLAN 2026-07-22).
# Every served page carries a build stamp (<meta name="build" content="<sha12>">, baked in
# src/server.ts from Railway's git SHA). This compares that stamp to local git and prints
# LIVE / NOT-LIVE per site. NO "done/shipped/pushed/fixed" claim without THIS output pasted.
set -uo pipefail
cd "$(dirname "$0")/.."
UA="Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0"
HEAD_SHA=$(git rev-parse HEAD)
git fetch -q origin main 2>/dev/null || true
MAIN_SHA=$(git rev-parse --verify -q origin/main 2>/dev/null || git rev-parse --verify -q FETCH_HEAD 2>/dev/null || echo "none")

stamp_of() {
  curl -s --max-time 20 -A "$UA" "$1" | grep -oE 'name="build" content="[0-9a-z]+"' | head -1 | sed -E 's/.*content="([0-9a-z]+)".*/\1/'
}

fail=0
check() { # label url
  local label="$1" url="$2" stamp verdict extra=""
  stamp=$(stamp_of "$url")
  if [ -z "$stamp" ]; then
    verdict="NOT-LIVE (no build stamp — server predates the stamp, still deploying, or down)"
    fail=1
  elif [ "${HEAD_SHA#"$stamp"}" != "$HEAD_SHA" ]; then
    verdict="LIVE (serving HEAD)"
  else
    verdict="NOT-LIVE (serving $stamp, HEAD is ${HEAD_SHA:0:12})"
    [ "${MAIN_SHA#"$stamp"}" != "$MAIN_SHA" ] && extra=" — that IS origin/main: expected until the next promote"
    fail=1
  fi
  printf '%-8s %s → %s%s\n' "$label" "$url" "$verdict" "$extra"
}

echo "HEAD = ${HEAD_SHA:0:12} · origin/main = ${MAIN_SHA:0:12}"
check staging https://staging.checkitforme.com/
check prod    https://checkitforme.com/
check admin   https://admin.checkitforme.com/
[ "$fail" -ne 0 ] && echo "Hint: staging redeploys ~1-3 min after a push — confirm /api/health, then re-run ONCE. Prod moves only on promote."
exit $fail
