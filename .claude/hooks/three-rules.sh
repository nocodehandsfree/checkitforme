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

A. THE REPLY RULES ABOVE ARE LOCKED (owner, 08-04) and machine-enforced by the
   reply lock. SHORT REPLY (2 lines or less, e.g. "Yes, all done."): just send
   it, no pre-check needed — the instant word scan still guards it. EVERYTHING
   LONGER GETS PRE-CHECKED: write the draft to a scratch file, run
   bash scripts/check-reply.sh <file> in the FOREGROUND (never as a background
   task) and WAIT for its verdict. NOT SENDABLE is a verdict, not an error.
   When a corrected version rides along, it is ALREADY APPROVED: confirm the
   facts survived and send exactly that text (facts wrong? fix only those,
   check once more). NEVER retry an unchanged draft, never loop. On APPROVED,
   send that exact text. Unapproved text gets graded at stop time and a
   failure BOUNCES VISIBLY — the owner reads the same reply twice (the 08-04
   repeat bug). Never resend text he has already seen; send only what changes.
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
