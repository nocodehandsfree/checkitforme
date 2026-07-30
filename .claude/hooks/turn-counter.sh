#!/usr/bin/env bash
# UserPromptSubmit: per-session counters (REBUILD_PLAN 2026-07-22; work-based 07-30). Agents
# cannot sense their own context fill. What fills them is ROUNDS OF WORK (tool calls, counted
# by work-counter.sh), not owner messages — 6 messages once hid 40+ rounds and the old
# message-only nudge stayed silent. Nudge fires at 100 rounds of work OR 25 messages,
# whichever comes first, and rides every message after.
input=$(cat)
sid=$(printf '%s' "$input" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id','nosession'))" 2>/dev/null)
f="${TMPDIR:-/tmp}/check-turns-${sid:-nosession}"
n=$(cat "$f" 2>/dev/null || echo 0)
case "$n" in (*[!0-9]*|"") n=0 ;; esac
n=$((n + 1))
printf '%s' "$n" > "$f"
w=$(cat "${TMPDIR:-/tmp}/check-work-${sid:-nosession}" 2>/dev/null || echo 0)
case "$w" in (*[!0-9]*|"") w=0 ;; esac
if [ "$n" -eq 1 ]; then
  jq -n '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:"FIRST TURN — RECITE THE BOX before any tool call. Your first reply states, in a few short lines: the ONE task you are taking, its done-when, and the EXISTING pieces you will snap onto (name the file or section — LAW 1). UI work adds: what the rendered comp shows for this screen. Cannot name the existing piece? Say so and STOP; do not fill the gap by inventing. A wrong recitation here costs the owner one message; a wrong build costs him a cycle."}}'
elif [ "$w" -ge 100 ] || [ "$n" -ge 25 ]; then
  jq -n --arg w "$w" '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:("Memory is heavy: \($w) rounds of work in this chat. Finish the task in front of you, close it out (checkpoint + STATE + push), and tell the owner this chat is done — new work goes to a fresh chat with a one-line Task prompt. Do not take on anything new here.")}}'
fi
exit 0
