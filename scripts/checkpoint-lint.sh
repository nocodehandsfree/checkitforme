#!/usr/bin/env bash
# Doc-cap gate — every living doc has a hard size cap; over cap FAILS the session close
# (Stop hook) and blocks a push (push-gate). DOC LAW: update = REPLACE stale content, never
# append; history lives in git, not the file. Caps: STATE.md 40 · checkpoints 60 · CLAUDE.md 100.
# Called by .claude/hooks/push-gate.sh and .claude/hooks/doc-caps-stop.sh.
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/..}" 2>/dev/null || true
fail=0

overcap() { # file cap
  local f="$1" cap="$2" n
  [ -f "$f" ] || return 0
  n=$(wc -l < "$f")
  if [ "$n" -gt "$cap" ]; then
    echo "BLOCKED: $f is $n lines (hard cap $cap)."
    echo "         REPLACE stale content (git keeps the history) — do not append — then retry."
    fail=1
  fi
}

overcap "docs/STATE.md" 40
overcap "CLAUDE.md" 100
for f in docs/team/*/checkpoint.md; do
  overcap "$f" 60
done

exit $fail
