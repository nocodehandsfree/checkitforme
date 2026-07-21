#!/usr/bin/env bash
# PreToolUse gate on Bash: refuses `git push` while a checkpoint is over the cap.
# Exit 2 = block the tool call and show the reason to the agent (CLAUDE.md → THE LAWS #11).
input=$(cat)
cmd=$(printf '%s' "$input" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null)
case "$cmd" in
  *"git push"*)
    cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
    if ! bash scripts/checkpoint-lint.sh >&2; then
      exit 2
    fi
    ;;
esac
exit 0
