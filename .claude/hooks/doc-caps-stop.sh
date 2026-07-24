#!/usr/bin/env bash
# Stop hook (REBUILD_PLAN 2026-07-22, Phase 5/6): a session cannot close while any living doc
# is over its hard cap. Runs the doc-cap gate; over cap = exit 2 blocks the stop and tells the
# agent to prune. stop_hook_active guards against an infinite stop loop. The standing rule the
# agent still owns: update STATE.md + your system checkpoint before you close.
d="${CLAUDE_PROJECT_DIR:-.}"
input=$(cat 2>/dev/null)
active=$(printf '%s' "$input" | python3 -c "import sys,json; print(json.load(sys.stdin).get('stop_hook_active', False))" 2>/dev/null)
[ "$active" = "True" ] && exit 0

cd "$d" || exit 0
if ! out=$(bash scripts/checkpoint-lint.sh 2>&1); then
  {
    echo "$out"
    echo "Session close blocked: prune the doc(s) above under cap, then stop again."
  } >&2
  exit 2
fi
exit 0
