#!/usr/bin/env bash
# PreToolUse gate on Write: NEW files only inside .claude/allowed-paths. Logic: sprawl-gate.py.
d="${CLAUDE_PROJECT_DIR:-.}"
exec python3 "$d/.claude/hooks/sprawl-gate.py" "$d"
