#!/usr/bin/env bash
# PostToolUse gate on Edit/Write to public/app.html: the Admin nav (groups, tabs, sections)
# is frozen to .claude/nav-allowlist. Logic: nav-gate.py. See CLAUDE.md LAW 4.
d="${CLAUDE_PROJECT_DIR:-.}"
exec python3 "$d/.claude/hooks/nav-gate.py" "$d"
