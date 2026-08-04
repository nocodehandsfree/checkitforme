#!/usr/bin/env bash
# THE REPLY LOCK — Stop hook. No reply reaches the owner until it passes the locked
# reply rules. Logic: reply-lock.py (word scan + cold reader check via claude -p).
d="${CLAUDE_PROJECT_DIR:-.}"
exec python3 "$d/.claude/hooks/reply-lock.py" "$d"
