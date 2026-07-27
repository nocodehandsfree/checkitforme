#!/usr/bin/env bash
# UserPromptSubmit: per-session turn counter (REBUILD_PLAN 2026-07-22). Agents cannot sense
# their own context fill, so turns are counted here instead; from turn 25 on, the handoff
# nudge rides in on every message so it can't fade.
input=$(cat)
sid=$(printf '%s' "$input" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id','nosession'))" 2>/dev/null)
f="${TMPDIR:-/tmp}/check-turns-${sid:-nosession}"
n=$(cat "$f" 2>/dev/null || echo 0)
case "$n" in (*[!0-9]*|"") n=0 ;; esac
n=$((n + 1))
printf '%s' "$n" > "$f"
if [ "$n" -ge 25 ]; then
  jq -n '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:"Context is aging — tell the owner it is handoff time after this task."}}'
fi
exit 0
