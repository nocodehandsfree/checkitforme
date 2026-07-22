#!/usr/bin/env bash
# PostToolUse gate on Edit/Write to user-facing files: no em/en dash, no hyphen-as-punctuation,
# plus banned terminology. Checks only what was just written. Logic: copy-gate.py.
d="${CLAUDE_PROJECT_DIR:-.}"
exec python3 "$d/.claude/hooks/copy-gate.py"
