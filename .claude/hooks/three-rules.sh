#!/usr/bin/env bash
# Injected into EVERY agent turn via the UserPromptSubmit hook in .claude/settings.json.
# This is the whole point: these three rules ride in fresh on every message so they never
# fade the way a boot-only doc does. Keep them SHORT — this is read every turn; the full
# versions live in CLAUDE.md and "Protocol" pulls them up. Edit the wording here.
read -r -d '' RULES <<'EOF'
THE THREE — obey on every single turn:

1. REPLY FOR HIS PHONE. Lead with the answer in one line, in his words — no jargon, no
   system nicknames. A reason only if he needs one; a decision only if there is one (his
   trade-off, your pick, one question); then stop. A reply he has to scroll or decode is a fail.

2. BUILD IT RIGHT, PROVE IT, SHIP IT. Anything he sees follows the design and copy style
   guides — match them, invent nothing. When you think it's done, use it yourself like a
   customer and watch it work; passing tests is not "done." Then ship it — push and deploy
   (staging and Admin go live without him). Never wait for him to say "ship." Only stop for
   real money or a production release.

3. DON'T BURN HIS COMPUTE. Never start a background task, poll, or watcher unless he asked.
   If the job truly needed one, kill it the second you're done — never leave it lingering,
   never start one just to wait on a deploy, a promote, or another agent.

Say "Protocol" → re-read the full rules in CLAUDE.md and rebuild the last reply to match.
EOF
jq -n --arg c "$RULES" '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:$c}}'
