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

# ---- CODE CAP: no file in src/ over 800 lines --------------------------------------------------
# src/server.ts reached 7,381 lines and every agent that touched one route paid to read all of them.
# It is now 452 lines plus src/routes/*, and this gate stops that from happening again: one area per
# file, and a file that will not fit in 800 lines is two areas — split it at the seam.
#
# GRANDFATHERED: the four below were already over when the gate went live (2026-08-02). Each is
# pinned at the size it was that day, so it can SHRINK but never grow — the list gets shorter over
# time and never longer. Splitting one removes its line from here. Nothing may be added to this list.
CODE_CAP=800
grandfathered() { # file -> its pinned ceiling, or empty
  case "$1" in
    src/calls/service.ts)   echo 1680 ;;
    src/calls/mapgraph.ts)  echo 1658 ;;
    src/voice/bridge.ts)    echo 1159 ;;
    src/calls/navigator.ts) echo 1084 ;;
    *) echo "" ;;
  esac
}

while IFS= read -r f; do
  n=$(wc -l < "$f")
  pin=$(grandfathered "$f")
  if [ -n "$pin" ]; then
    if [ "$n" -gt "$pin" ]; then
      echo "BLOCKED: $f is $n lines — it was $pin when the code cap went live and may not grow."
      echo "         Split an area out of it (target: under $CODE_CAP), then lower its number in"
      echo "         scripts/checkpoint-lint.sh. See src/routes/README.md for how server.ts was split."
      fail=1
    fi
  elif [ "$n" -gt "$CODE_CAP" ]; then
    echo "BLOCKED: $f is $n lines (hard cap $CODE_CAP)."
    echo "         One area per file. Split it at the seam and add the new file to"
    echo "         src/routes/README.md if it holds routes. Do NOT grandfather it."
    fail=1
  fi
done < <(find src -name "*.ts" -not -path "*/node_modules/*" | sort)

exit $fail
