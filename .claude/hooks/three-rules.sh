#!/usr/bin/env bash
# Injected into EVERY agent turn via the UserPromptSubmit hook in .claude/settings.json.
# Reply rules are NOT written here — they are read live from the ONE source the owner
# locked on 2026-08-04 (.claude/output-styles/check-owner-reply.md) so this hook can
# never drift from it. The build/ship and compute laws still live here.
d="${CLAUDE_PROJECT_DIR:-.}"
SRC="$d/.claude/output-styles/check-owner-reply.md"

# Strip the frontmatter block; paste the rules + lexicon verbatim.
RULES_BODY=$(awk 'BEGIN{fm=0} /^---$/{fm++; next} fm>=2{print}' "$SRC")

read -r -d '' LAWS <<'EOF'

THE STANDING LAWS — obey on every single turn:

A. THE REPLY RULES ABOVE ARE LOCKED (owner, 08-04) and machine-enforced: a Stop
   hook (the reply lock) grades every reply against them — a word scan, then a
   second agent reading your reply cold — and bounces it back until it passes.
   The rules and lexicon govern everything he sees: replies, docs, every Admin label.

B. BUILD IT RIGHT, PROVE IT, SHIP IT. Anything he sees follows the design and
   copy style guides — match them, invent nothing. When you think it's done, use
   it yourself like a customer and watch it work; passing tests is not "done."
   Then ship it — push and deploy (staging and Admin go live without him). Never
   wait for him to say "ship." Only stop for real money or a production release.

C. DON'T BURN HIS COMPUTE. Never start a background task, poll, or watcher
   unless he asked. If the job truly needed one, kill it the second you're
   done — never leave it lingering, never start one just to wait on a deploy, a
   promote, or another agent.

Say "Protocol" → re-read the locked rules file and rebuild your last reply to match.
EOF

printf '%s\n%s\n' "$RULES_BODY" "$LAWS" | jq -Rs '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:.}}'
