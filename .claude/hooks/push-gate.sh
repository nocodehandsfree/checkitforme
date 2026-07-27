#!/usr/bin/env bash
# PreToolUse gate on Bash, two jobs:
#  1) refuses `git push` while any team checkpoint is over the cap (CLAUDE.md LAW 11)
#  2) COMPUTE GATE (REBUILD_PLAN 2026-07-22): background/watcher commands are blocked
#     unless repo-root .unlock-bg exists (gitignored). Owner's law: don't burn his compute.
input=$(cat)
cmd=$(printf '%s' "$input" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null)
d="${CLAUDE_PROJECT_DIR:-.}"

case "$cmd" in
  *"git push"*)
    cd "$d" || exit 0
    if ! bash scripts/checkpoint-lint.sh >&2; then
      exit 2
    fi
    ;;
esac

if [ ! -f "$d/.unlock-bg" ]; then
  hit=""
  printf '%s' "$cmd" | grep -qE '(^|[^&>])&[[:space:]]*$'   && hit="trailing '&' (background job)"
  printf '%s' "$cmd" | grep -qE '(^|[;&|[:space:]])nohup\b'  && hit="nohup"
  printf '%s' "$cmd" | grep -qE '(^|[;&|[:space:]])sleep '   && hit="sleep"
  printf '%s' "$cmd" | grep -qE '(^|[;&|[:space:]])watch '   && hit="watch"
  printf '%s' "$cmd" | grep -qE 'tail[[:space:]]+-f'         && hit="tail -f"
  printf '%s' "$cmd" | grep -qE 'while[[:space:]]+true'      && hit="while true"
  if [ -n "$hit" ]; then
    {
      echo "COMPUTE GATE: blocked — $hit. No background tasks, polls, watchers, or waits. Owner's law."
      echo "Waiting on a deploy/promote/another agent is NEVER a loop — check ONCE when you need it."
      echo "Only if the owner literally asked for a watcher: create repo-root .unlock-bg (gitignored),"
      echo "do that one task, then DELETE .unlock-bg and kill the process before your turn ends."
    } >&2
    exit 2
  fi
fi
exit 0
