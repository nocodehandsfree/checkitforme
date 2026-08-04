#!/usr/bin/env bash
# PRE-CHECK a reply draft against the owner's locked reply rules BEFORE sending it
# (the 08-04 duplicate fix: a Stop-time bounce shows the owner the same reply twice,
# so grading must happen on the DRAFT, where he sees nothing).
# Usage: write your draft to a file, then  bash scripts/check-reply.sh <draft-file>
# APPROVED → send that exact text; the reply lock recognizes it and stays silent.
# Not sendable → fix the draft and run again. Never send text that has not passed.
d="$(cd "$(dirname "$0")/.." && pwd)"
exec python3 "$d/.claude/hooks/reply-lock.py" --check-file "$1"
