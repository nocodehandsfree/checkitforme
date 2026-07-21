#!/usr/bin/env bash
# Checkpoint cap gate — a push is refused while any team checkpoint is over the cap.
# Rule: CLAUDE.md → THE LAWS #11. Soft target is 80 lines; hard block at 85.
CAP=85
fail=0
for f in docs/team/*/checkpoint.md; do
  [ -f "$f" ] || continue
  n=$(wc -l < "$f")
  if [ "$n" -gt "$CAP" ]; then
    echo "BLOCKED: $f is $n lines (hard cap $CAP, target 80)."
    echo "         Prune finished items — git keeps the history — then push again."
    fail=1
  fi
done
exit $fail
