#!/usr/bin/env bash
# PreToolUse gate on Edit/Write: paths matching a glob in .claude/locks are FROZEN.
# Per-task unlock: repo-root .unlock (gitignored) containing that EXACT glob line.
# Absence of .unlock is the permanent default. Logic: edit-gate.py; flow: REBUILD_PLAN.md.
d="${CLAUDE_PROJECT_DIR:-.}"
exec python3 "$d/.claude/hooks/edit-gate.py" "$d"
