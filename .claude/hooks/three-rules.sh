#!/usr/bin/env bash
# Injected into EVERY agent turn via the UserPromptSubmit hook in .claude/settings.json.
# Reply rules are NOT written here — they are read live from the ONE source the owner
# locked on 2026-08-04 (.claude/output-styles/check-owner-reply.md) so this hook can
# never drift from it. The build/ship and compute laws still live here.
# 08-05: this hook also SAVES the owner's latest message, keyed by session id, so the
# reply renderer can read it (agreed architecture, owner's "go" 2026-08-05).
#
# 08-06, THE FULL RULES NO LONGER RIDE ON EVERY MESSAGE (owner's go, he spotted it).
# Every message he sent used to carry a fresh copy of all 11 rules plus the lexicon, about
# 1,600 words. A 40 message chat therefore held 40 identical copies, and because an agent
# re-reads the whole conversation on every turn it read all of them every time. Now the
# full block rides message 1 and every 10th message after; the turns in between carry a
# short reminder naming the rules that actually get broken. Enforcement did not move: the
# BLOCK has always been the reply lock reading the finished reply, never this paste.
# Re-sending in full every 10th turn is deliberate: a long chat gets summarized and the
# first message can fall out of the summary, so the full text comes back around.
d="${CLAUDE_PROJECT_DIR:-.}"
SRC="$d/.claude/output-styles/check-owner-reply.md"

INPUT=$(cat 2>/dev/null)
PDIR="$d/.claude/state/reply-lock/prompts"
TDIR="$d/.claude/state/reply-lock/turns"
mkdir -p "$PDIR" "$TDIR" 2>/dev/null
# Prints FULL or SHORT. Unknown session = FULL, so a chat we cannot count never ends up
# running on the reminder alone.
MODE=$(RL_INPUT="$INPUT" RL_PDIR="$PDIR" RL_TDIR="$TDIR" python3 -c '
import json, os, glob
mode = "FULL"
try:
    data = json.loads(os.environ.get("RL_INPUT") or "{}")
    sid = (data.get("session_id") or "")[:36]
    prompt = data.get("prompt") or ""
    pdir, tdir = os.environ["RL_PDIR"], os.environ["RL_TDIR"]
    if prompt and sid:
        with open(os.path.join(pdir, sid + ".txt"), "w") as fh:
            fh.write(prompt)
    files = sorted(glob.glob(os.path.join(pdir, "*.txt")), key=os.path.getmtime)
    for f in files[:-10]:
        os.remove(f)
    if sid:
        cf = os.path.join(tdir, sid + ".count")
        n = 0
        if os.path.exists(cf):
            try:
                n = int(open(cf).read().strip() or 0)
            except Exception:
                n = 0
        n += 1
        with open(cf, "w") as fh:
            fh.write(str(n))
        for f in sorted(glob.glob(os.path.join(tdir, "*.count")), key=os.path.getmtime)[:-20]:
            os.remove(f)
        mode = "FULL" if (n == 1 or n % 10 == 0) else "SHORT"
except Exception:
    mode = "FULL"
print(mode)
' 2>/dev/null)
[ -z "$MODE" ] && MODE=FULL

# Strip the frontmatter block; paste the rules + lexicon verbatim.
RULES_BODY=$(awk 'BEGIN{fm=0} /^---$/{fm++; next} fm>=2{print}' "$SRC")

read -r -d '' LAWS <<'EOF'

THE STANDING LAWS — obey on every single turn:

A. THE REPLY RULES ABOVE ARE LOCKED (owner, 08-04) and machine-enforced by the
   reply lock. HOW TO REPLY (renderer flow, owner's go 08-05): write your best
   COMPLETE answer normally — every fact, number, name, decision, uncertainty,
   exact quote intact. No style effort needed; a dedicated renderer puts it in
   the owner's voice. SHORT REPLY (4 lines or less, e.g. "Yes, all done." —
   owner widened it from 2 on 08-06 so a simple answer is instant):
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

read -r -d '' REMINDER <<'EOF'
THE REPLY RULES ARE LOCKED (owner, 08-04). The full list of 11 plus the lexicon
was pasted earlier in this chat and comes back around every 10th message; the
one source is .claude/output-styles/check-owner-reply.md — OPEN IT the moment
you are unsure, and after any conversation summary. These are the ones agents
actually break, so read them before every reply:

- ANSWER FIRST. No wind-up, no headline, no TLDR label, no flattery, no filler.
- NAME EVERYTHING. Use the lexicon's real name (a check is a phone call to a
  store, a test check is one against the Fun store, Charlie speaks to Staff).
  A thing NOT on that list gets a plain sentence saying what it is the FIRST
  time it appears, in the same breath. Never "this" or "them" without naming
  the thing. Never invent a label, never computer speak.
- EXPLAIN IT LIKE HE IS FIVE, in full everyday sentences. He was not in your
  chat and does not know what you are talking about. An old bug or fix gets one
  line of when it happened and what it was.
- ONLY BACKGROUND WHEN HE HAS A DECISION. Never raise a non-issue to flag it.
- 25 LINES OR LESS. The one exception: a piece of work he asked to be handed in
  the chat (all the tests, a full list, exact wording) prints in full, uncapped.
- NO DASHES INSIDE SENTENCES. Bold is a SHORT label alone on its own line, 3 at
  most, never a bold sentence, no headings, no divider lines.

HOW TO REPLY: 4 lines or less, just send it. Otherwise write your best COMPLETE
answer (every fact, number, name, decision, quote intact) to a scratch file, run
bash scripts/check-reply.sh <file> in the FOREGROUND, wait, and send EXACTLY the
approved text. Never resend text he has already seen.

ALSO EVERY TURN: done means DEMONSTRATED, never claimed — drive it yourself and
say what you saw, or say NOT verified and why. Ship it without waiting for him
(staging and Admin go live without him); stop only for real money or a
production release. Never start a background task, poll, or watcher unless he
asked for one.
EOF

if [ "$MODE" = "FULL" ]; then
  printf '%s\n%s\n' "$RULES_BODY" "$LAWS" | jq -Rs '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:.}}'
else
  printf '%s\n' "$REMINDER" | jq -Rs '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:.}}'
fi
