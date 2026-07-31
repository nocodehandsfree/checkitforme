#!/usr/bin/env bash
# UserPromptSubmit: per-session counters (REBUILD_PLAN 2026-07-22; weight-based 07-30, owner:
# "it has to do with how much work they've done" — never message count). Agents cannot sense
# their own context fill, so we weigh the transcript file itself (the chat's real memory) and
# fall back to rounds of work (work-counter.sh). Message count is only used to spot turn one.
# 25-message nudge RETIRED: line-by-line copy sessions tripped it inside an hour while nearly
# empty. Fires at ~8MB of transcript OR 250 rounds of work, then rides every message after.
input=$(cat)
sid=$(printf '%s' "$input" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id','nosession'))" 2>/dev/null)
f="${TMPDIR:-/tmp}/check-turns-${sid:-nosession}"
n=$(cat "$f" 2>/dev/null || echo 0)
case "$n" in (*[!0-9]*|"") n=0 ;; esac
n=$((n + 1))
printf '%s' "$n" > "$f"
w=$(cat "${TMPDIR:-/tmp}/check-work-${sid:-nosession}" 2>/dev/null || echo 0)
case "$w" in (*[!0-9]*|"") w=0 ;; esac
tp=$(printf '%s' "$input" | python3 -c "import sys,json; print(json.load(sys.stdin).get('transcript_path',''))" 2>/dev/null)
tsize=0
[ -n "$tp" ] && [ -f "$tp" ] && tsize=$(wc -c < "$tp" 2>/dev/null || echo 0)
case "$tsize" in (*[!0-9]*|"") tsize=0 ;; esac
if [ "$n" -eq 1 ]; then
  jq -n '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:"FIRST TURN — RECITE THE BOX before any tool call. Your first reply states, in a few short lines: the ONE task you are taking, its done-when, and the EXISTING pieces you will snap onto (name the file or section — LAW 1). UI work adds: what the rendered comp shows for this screen. Cannot name the existing piece? Say so and STOP; do not fill the gap by inventing. A wrong recitation here costs the owner one message; a wrong build costs him a cycle."}}'
elif [ "$tsize" -ge 8000000 ] || [ "$w" -ge 250 ]; then
  jq -n --arg w "$w" --arg mb "$((tsize / 1000000))" '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:("Memory is genuinely heavy now (\($mb)MB of chat, \($w) rounds of work). Finish the task in front of you and close it out (checkpoint + STATE + push). Mention ONCE, at your next natural close-out, that this chat is aging and a fresh one is safer for the NEXT task — never mid-task, never as a complaint, and NEVER claim the chat is too long on its own authority before this notice exists. His call, always: if he says continue here, continue here and do not raise it again.")}}'
fi
exit 0
