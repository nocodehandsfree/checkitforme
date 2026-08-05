#!/usr/bin/env bash
# Injected into EVERY agent turn via the UserPromptSubmit hook in .claude/settings.json.
# Reply rules are NOT written here — they are read live from the ONE source the owner
# locked on 2026-08-04 (.claude/output-styles/check-owner-reply.md) so this hook can
# never drift from it. The build/ship and compute laws still live here.
# 08-05: this hook also SAVES the owner's latest message, keyed by session id, so the
# reply renderer can read it (agreed architecture, owner's "go" 2026-08-05).
d="${CLAUDE_PROJECT_DIR:-.}"
SRC="$d/.claude/output-styles/check-owner-reply.md"

INPUT=$(cat 2>/dev/null)
PDIR="$d/.claude/state/reply-lock/prompts"
mkdir -p "$PDIR" 2>/dev/null
RL_INPUT="$INPUT" RL_PDIR="$PDIR" python3 -c '
import json, os, glob
try:
    data = json.loads(os.environ.get("RL_INPUT") or "{}")
    sid = (data.get("session_id") or "unknown")[:36]
    prompt = data.get("prompt") or ""
    pdir = os.environ["RL_PDIR"]
    if prompt:
        with open(os.path.join(pdir, sid + ".txt"), "w") as fh:
            fh.write(prompt)
    files = sorted(glob.glob(os.path.join(pdir, "*.txt")), key=os.path.getmtime)
    for f in files[:-10]:
        os.remove(f)
except Exception:
    pass
' 2>/dev/null

# Strip the frontmatter block; paste the rules + lexicon verbatim.
RULES_BODY=$(awk 'BEGIN{fm=0} /^---$/{fm++; next} fm>=2{print}' "$SRC")

read -r -d '' LAWS <<'EOF'

THE STANDING LAWS — obey on every single turn:

A. THE REPLY RULES ABOVE ARE LOCKED (owner, 08-04) and machine-enforced by the
   reply lock. HOW TO REPLY (renderer flow, owner's go 08-05): write your best
   COMPLETE answer normally — every fact, number, name, decision, uncertainty,
   exact quote intact. No style effort needed; a dedicated renderer puts it in
   the owner's voice. SHORT REPLY (2 lines or less, e.g. "Yes, all done."):
   skip everything and just send. Otherwise save the answer to a scratch file
   and run bash scripts/check-reply.sh <file> in the FOREGROUND (never in
   background) and WAIT. It returns APPROVED text: yours unchanged, or a
   rendered version whose facts were verified mechanically and by a meaning
   pass. Send EXACTLY the approved text. A wrong fact in the rendering: fix
   only that fact in YOUR draft and check once more. NEVER retry an unchanged
   draft, never loop. Unapproved text gets graded when you stop and a failure
   BOUNCES VISIBLY — the owner reads the same reply twice. Never resend text
   he has already seen; send only what corrects it. When the owner pastes a
   reply that bugged him plus a fixed version he approves, the pair is saved
   to .claude/reply-examples/ so every chat's renderer learns from it.
   The lexicon covers everything he reads: replies, docs, every Admin label.
   BUT THE REPLY STYLE STOPS AT THE CHAT WINDOW (owner, 08-05): it NEVER
   shapes work product. Charlie's instructions follow the Charlie spec, code
   follows the codebase, customer copy follows the copy guide. While building,
   forget the renderer exists; it meets you once, when you write to the owner.

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
