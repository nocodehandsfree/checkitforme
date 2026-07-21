#!/usr/bin/env bash
# PreToolUse gate on Edit/Write: the calling engine is FROZEN (owner, 2026-07-21).
# src/voice/ works as mapped — it is not editable by default, by anyone.
# Per-task unlock: PM (with the owner's word) creates .unlock-voice in the repo root
# for that ONE task. The file is gitignored — absence is the permanent default.
input=$(cat)
fp=$(printf '%s' "$input" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null)
case "$fp" in
  */src/voice/*|src/voice/*)
    d="${CLAUDE_PROJECT_DIR:-.}"
    if [ ! -f "$d/.unlock-voice" ]; then
      {
        echo "FROZEN: src/voice/ is the calling engine — locked by the owner (2026-07-21)."
        echo "It dials, navigates, and connects exactly as mapped; that behavior is not yours to change."
        echo "If your task truly needs an engine change, STOP and write 'PM: engine change wanted — <why>'"
        echo "in your checkpoint. PM + owner unlock it per task by creating .unlock-voice."
      } >&2
      exit 2
    fi
    ;;
esac
exit 0
