#!/usr/bin/env bash
# PostToolUse on Edit/Write: regenerate docs/design/INDEX.md whenever one of the giant
# indexed HTML files changes, so the section index never drifts (REBUILD_PLAN 2026-07-22).
input=$(cat)
fp=$(printf '%s' "$input" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null)
case "$fp" in
  */public/checkit.html|public/checkit.html|*/public/app.html|public/app.html|*/docs/design/comps/*.html|docs/design/comps/*.html)
    cd "${CLAUDE_PROJECT_DIR:-.}" && node scripts/gen-index.mjs >/dev/null 2>&1 || true
    ;;
esac
exit 0
