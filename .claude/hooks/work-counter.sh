#!/usr/bin/env bash
# PostToolUse on EVERY tool: count rounds of WORK, not owner messages (owner + Echo, 07-30).
# A chat with 6 owner messages can hide 40+ rounds of reads, checks and test calls — that is
# what fills the memory. turn-counter.sh reads this file and nudges handoff off REAL fill.
input=$(cat)
sid=$(printf '%s' "$input" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id','nosession'))" 2>/dev/null)
f="${TMPDIR:-/tmp}/check-work-${sid:-nosession}"
n=$(cat "$f" 2>/dev/null || echo 0)
case "$n" in (*[!0-9]*|"") n=0 ;; esac
printf '%s' "$((n + 1))" > "$f"
exit 0
