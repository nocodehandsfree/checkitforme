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
   reply lock. HOW TO REPLY (the 08-05 flip — one job per agent): do NOT try
   to style your reply yourself. Write a DRAFT to a scratch file that is just
   the facts in your own natural words. SHORT REPLY (2 lines or less, e.g.
   "Yes, all done."): skip all of it and just send. Otherwise run
   bash scripts/check-reply.sh <file> in the FOREGROUND (never in background)
   and WAIT. The checker is the owner's dedicated writer: it approves your
   draft or hands back its own version in the owner's style, ALREADY APPROVED.
   Confirm every fact, number, and decision survived, then send that exact
   text (a wrong fact: fix only that, check once more). NEVER retry an
   unchanged draft, never loop. Unapproved text gets graded at stop time and
   a failure BOUNCES VISIBLY — the owner reads the same reply twice (the
   08-04 repeat bug). Never resend text he has already seen; send only what changes.
   The lexicon covers everything he reads: replies, docs, every Admin label.
   BUT THE REPLY STYLE STOPS AT THE CHAT WINDOW (owner, 08-05): it NEVER
   shapes work product. Charlie's instructions follow the Charlie spec, code
   follows the codebase, customer copy follows the copy guide. Writing the
   WORK to please the reply grading is exactly the 08-05 failure where a chat
   admitted "I was writing to satisfy the new grading instead of writing to
   Charlie" — never do that. While building, forget the grader exists; it
   meets you once, at the moment you write to the owner.

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
