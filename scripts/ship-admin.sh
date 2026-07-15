#!/usr/bin/env bash
# Ship the admin UI to THE Admin (admin.checkitforme.com) WITHOUT a promote.
# Admin-UI-only ship path (owner 2026-07-15): commit public/app.html to staging first (git stays
# the source of truth), then run this — the prod service swaps the page in ~10s, atomically,
# serving live prod data as always. Shared server code still ships via the normal promote train.
#
#   bash scripts/ship-admin.sh              # ship the committed public/app.html to THE Admin
#   bash scripts/ship-admin.sh --staging    # ship to the staging service instead (rehearsal)
#   bash scripts/ship-admin.sh --rollback   # restore the previous version
#   bash scripts/ship-admin.sh --status     # who's live: override (commit/when) or bundled
#
# ADMIN_TOKEN is self-fetched from Railway when RAILWAY_API_TOKEN is present.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT_ID="889e332c-30fe-46e9-a18e-d8de4f7523aa"
ENV_ID="7cbf9327-357a-415e-9031-d1609aead2b4"
SVC_PROD="d363a982-e918-4433-b175-defe8faf0ec9"
SVC_STAGING="8165df7a-3bdf-41a5-bdce-24883633a096"

BASE="https://admin.checkitforme.com"; SVC="$SVC_PROD"; ACTION="deploy"
for arg in "$@"; do case "$arg" in
  --staging) BASE="https://staging.checkitforme.com"; SVC="$SVC_STAGING" ;;
  --rollback) ACTION="rollback" ;;
  --status) ACTION="status" ;;
  *) echo "unknown flag: $arg" >&2; exit 2 ;;
esac; done

fetch_admin_token() {
  [ -z "${RAILWAY_API_TOKEN:-}" ] && return 0
  curl -s -X POST https://backboard.railway.app/graphql/v2 \
    -H "Authorization: Bearer $RAILWAY_API_TOKEN" -H "Content-Type: application/json" \
    -d "{\"query\":\"{ variables(projectId: \\\"$PROJECT_ID\\\", environmentId: \\\"$ENV_ID\\\", serviceId: \\\"$SVC\\\") }\"}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['variables'].get('ADMIN_TOKEN',''))" 2>/dev/null
}
TOK="${ADMIN_TOKEN:-$(fetch_admin_token)}"
[ -z "$TOK" ] && { echo "✗ no ADMIN_TOKEN (set it or provide RAILWAY_API_TOKEN)" >&2; exit 1; }
UA="Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0"

case "$ACTION" in
  status)
    curl -sf -A "$UA" -H "x-admin-token: $TOK" "$BASE/api/admin/ui-version"; echo ;;
  rollback)
    curl -sf -A "$UA" -H "x-admin-token: $TOK" -X POST "$BASE/api/admin/ui-rollback"; echo
    echo "→ rolled back. Verify: $BASE loads and the change is gone." ;;
  deploy)
    # Git is the source of truth: ship exactly what's committed, never a dirty working copy.
    if ! git diff --quiet -- public/app.html; then
      echo "✗ public/app.html has UNCOMMITTED changes — commit (and push) to staging first." >&2; exit 1
    fi
    COMMIT="$(git rev-parse --short HEAD)"
    echo "→ shipping public/app.html @ $COMMIT to $BASE …"
    curl -sf -A "$UA" -H "x-admin-token: $TOK" -H "x-commit: $COMMIT" -H "content-type: text/html" \
      --data-binary @public/app.html -X POST "$BASE/api/admin/ui-deploy"; echo
    # Verify it actually serves (content marker beats trusting the 200 — /api/* 401s lie, pages don't).
    sleep 1
    if curl -sf "$BASE/" | grep -q "grpnav"; then echo "✓ THE Admin is serving the new shell ($COMMIT)."
    else echo "⚠ deploy accepted but the shell marker wasn't seen — check $BASE by hand." >&2; exit 1; fi ;;
esac
