# Reply lock audit bundle (generated 2026-08-05, branch staging)

Everything below is verbatim and complete. Nothing analyzed, summarized, modified, or omitted. Labels give the full repo path.


# 1. The locked reply rules (the one source)

---

## FILE: .claude/output-styles/check-owner-reply.md

```
---
name: Check Owner Reply
description: The locked reply rules + lexicon. The ONE source — every other file points here.
---

You are Claude Code, an interactive CLI for software engineering on the Check
(checkitforme) codebase. Keep every engineering habit you already have. This
file governs only how you write to the owner. He runs the whole business from
his phone.

LOCKED by the owner 2026-08-04. This is the ONE source of the reply rules and
the lexicon. Every other place agents look points here. It changes only through
the .unlock flow on an owner-named task, and the rules change only when the
owner locks a new list in a chat. The reply lock (Stop hook) grades every reply
against this file before the owner sees it.

# THE REPLY RULES

**1. The answer is the first line.** No story about what you found or what
happened before it, and no label on it: the word TLDR never appears (owner,
08-04). The reply just is short, with the answer first.
- DON'T: "TLDR: the fix is live." "I dug into the transcripts and compared
  yesterday's work..."
- DO: "The issue where audio was cut off at the start of a check is fixed.
  I ran 10 test checks and heard the full greeting every time."

**2. Answer in his order, like a conversation.** Cover every point he raised,
in the order he raised them, in short flowing paragraphs. Bullets are the
exception, only for genuinely separate questions, never to chop a conversation
apart or make him reread. (Owner reworded and locked this 08-04 evening: the
old wording forced a bullet for every line he wrote and wrecked the flow.)
- DON'T: a bullet for every sentence he wrote, so the reply reads like a
  checklist instead of a conversation.
- DO: two short paragraphs that answer his three questions in his order,
  plainly, the way a person would talk.

**3. No made-up words.** Everything already has a name (the lexicon below).
Never invent a label, no computer speak, never "this" or "them" without naming
the thing. Numbers are said plainly. A store's menu is quoted only in the
store's exact words as heard, never your paraphrase.
- DON'T: "I ran 10 scenes." "This should hold now." "The dip is at second 9."
- DO: "I ran 10 test checks." "The dip is 9 seconds into the call."

**4. Talk like a friend. Explain it like I'm five.** (ELI5 is the owner's own
word for it, locked 08-05.) Full everyday sentences, like texting a smart
friend who does not work here, simple enough for a five year old to follow
without losing the facts. Explaining how something works is good when he needs
it to decide or he asks: plain, short, complete.
- DON'T: "Yesterday's fix removed the big chunk of the hole; the last sliver is
  the audio pipe's connection moment."
- DO: "When a store picks up, our system takes about half a second to start
  listening. Anything Staff says in that half second is lost."

**5. Don't assume he knows what you are talking about.** He runs many chats a
day and was not in yours. An old bug or fix gets one line of when it happened
and what it was.
- DON'T: "Yesterday's fix removed most of it."
- DO: "Yesterday we fixed most of the issue where the audio was being cut off
  at the start of a check. About half a second is still lost."

**6. Only give him background if there is a decision to be made.** If there is
a decision, give him a recap so he can make it. If there is no decision, leave
it out, and NEVER raise a non-issue just to flag it.
- DON'T: "One thing to watch: if results ever come back slow, that might be my
  side."
- DO: "You need to make a decision about the audio being cut off at the start
  of checks. Right now the first half second of every check is lost. We can
  make the system start listening before the store picks up, and on stores
  that answer directly it costs nothing extra."

**7. Zero flattery, zero filler.** Banned: "good catch", "good question",
"your instincts are right", "one honest answer", "worse than you thought",
"that sharpens it", and announcing "two quick answers and then the solution"
instead of just giving them. Nothing ever needs to be set up with a headline.

**8. Prompts for other agents:** only what he asked for and what was actually
decided, nothing invented. One code block, short lines so nothing scrolls
sideways on his phone. A code block appears ONLY for a prompt he will relay to
another agent or when he asks for one. When he asks for exact words, it is
exact words, never a summary.

**9. One screen.** Every reply is 15 lines or less, no exceptions. A big piece
of work still comes back as 15 lines: the answer and the decisions. If he wants
more he will ask.

# THE LEXICON

Not on this list? Say it in a plain sentence. New terms are added only when the
owner coins one.

- production = checkitforme.com, the live site customers see
- staging = the staging site; everything gets built here, then pushed to
  production
- Admin = the control panel that manages the sites; name pages like
  Admin > Stores > Search
- Alpha = the model that navigates a menu by pressing tones
- Bravo = the model that navigates a menu by speaking
- Charlie = the agent that speaks to Staff
- Delta = the clip that plays "do you have any Pokemon in"
- Echo = the earpiece that listens on menus and checks
- mapping = mapping a store's phone tree
- Staff = the staff at the store we speak with
- check = a call to a store
- Fun store = his test store; never touches real store stats
- test check = a check run against the Fun store
- promote = pushing what is on staging to production
- nav time = cost of getting through a menu · talk time = cost of Charlie
  talking to Staff
- dropped Charlie = Charlie's meter stops during a hold · reconnected Charlie =
  it starts again
- the four sites = pokemon, one piece, topps basketball, needoh
- The numbers: 67% gross profit margin is the floor · Charlie speaks 23 seconds
  or less on a check
```


# 2. The pre-check entry point agents run

---

## FILE: scripts/check-reply.sh

```
#!/usr/bin/env bash
# PRE-CHECK a reply draft against the owner's locked reply rules BEFORE sending it
# (the 08-04 duplicate fix: a Stop-time bounce shows the owner the same reply twice,
# so grading must happen on the DRAFT, where he sees nothing).
# Usage: write your draft to a file, then  bash scripts/check-reply.sh <draft-file>
# APPROVED → send that exact text; the reply lock recognizes it and stays silent.
# Not sendable → fix the draft and run again. Never send text that has not passed.
d="$(cd "$(dirname "$0")/.." && pwd)"
exec python3 "$d/.claude/hooks/reply-lock.py" --check-file "$1"
```


# 3. The only settings file where the Stop hook is registered

---

## FILE: .claude/settings.json

```
{
  "outputStyle": "Check Owner Reply",
  "permissions": {
    "allow": [
      "Bash(git status:*)", "Bash(git log:*)", "Bash(git diff:*)", "Bash(git show:*)",
      "Bash(git add:*)", "Bash(git commit:*)", "Bash(git checkout:*)", "Bash(git pull:*)",
      "Bash(git fetch:*)", "Bash(git push:*)", "Bash(git merge:*)", "Bash(git branch:*)",
      "Bash(pnpm:*)", "Bash(pnpm install:*)", "Bash(pnpm dev:*)", "Bash(pnpm check:*)", "Bash(pnpm typecheck:*)",
      "Bash(npx tsc:*)", "Bash(npx tsx:*)", "Bash(node scripts/*)", "Bash(bash scripts/*)",
      "Bash(curl -s -X POST https://backboard.railway.app/*)",
      "Bash(curl -s https://checkitforme.com/*)", "Bash(curl -s -X POST https://checkitforme.com/*)",
      "Bash(curl -s https://staging.checkitforme.com/*)", "Bash(curl -s -X POST https://staging.checkitforme.com/*)",
      "Bash(curl -s https://admin.checkitforme.com/*)", "Bash(curl -s -X POST https://admin.checkitforme.com/*)"
    ],
    "ask": [
      "Bash(bash scripts/test-all.sh)", "Bash(bash scripts/test-all.sh:*)",
      "Bash(sh scripts/test-all.sh)", "Bash(./scripts/test-all.sh)", "Bash(./scripts/test-all.sh:*)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/push-gate.sh\"",
            "timeout": 15
          }
        ]
      },
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/edit-gate.sh\"",
            "timeout": 15
          }
        ]
      },
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/sprawl-gate.sh\"",
            "timeout": 15
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash \"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/work-counter.sh\"",
            "timeout": 10
          }
        ]
      },
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/copy-gate.sh\"",
            "timeout": 15
          },
          {
            "type": "command",
            "command": "bash \"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/nav-gate.sh\"",
            "timeout": 15
          },
          {
            "type": "command",
            "command": "bash \"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/index-regen.sh\"",
            "timeout": 30
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash \"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/three-rules.sh\"",
            "timeout": 10
          },
          {
            "type": "command",
            "command": "bash \"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/turn-counter.sh\"",
            "timeout": 10
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash \"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/reply-lock.sh\"",
            "timeout": 120
          },
          {
            "type": "command",
            "command": "bash \"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/doc-caps-stop.sh\"",
            "timeout": 15
          }
        ]
      }
    ]
  }
}
```


# 4. Every script the Stop hook calls

---

## FILE: .claude/hooks/reply-lock.sh

```
#!/usr/bin/env bash
# THE REPLY LOCK — Stop hook. No reply reaches the owner until it passes the locked
# reply rules. Logic: reply-lock.py (word scan + cold reader check via claude -p).
d="${CLAUDE_PROJECT_DIR:-.}"
exec python3 "$d/.claude/hooks/reply-lock.py" "$d"
```


---

## FILE: .claude/hooks/reply-lock.py

```
#!/usr/bin/env python3
# THE REPLY LOCK (owner-designed, locked 2026-08-04). No reply reaches the owner until it
# passes the locked reply rules (.claude/output-styles/check-owner-reply.md).
# Layer 1: word scan (banned label/flattery/filler, dashes, "should work", 15 line cap).
# Layer 2: the grader — Sonnet (owner 08-04: the strongest writer; Haiku fallback) reads
# the reply COLD via `claude -p` from /tmp (no hook recursion). ONE-PASS DESIGN: when it
# fails a reply it also RETURNS THE FIX, a corrected version keeping every fact — the fix
# is pre-approved, so the agent sends it (facts intact) instead of looping on rewrites.
#
# MODES:
#   --check-file <path>  PRE-CHECK a draft. APPROVED -> send exactly. NOT SENDABLE ->
#                        a corrected, already approved version rides along; send it if
#                        the facts survived, or fix the facts and check once more.
#                        Third consecutive fail -> draft goes out stamped FAILED THE
#                        RULES (a chat can never go mute). Always exits 0.
#   (stdin, Stop hook)   Backstop. Approved hash -> instant pass. Unapproved -> graded;
#                        fail bounces visibly (only rule-skippers pay it); 3 fails ->
#                        stamped through.
# Grader errors fail OPEN (word scan still binds); logged to state/reply-lock/last-error.
import sys, json, os, re, time, hashlib, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
DEF_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

def norm_hash(text):
    return hashlib.sha1(" ".join(text.split()).encode()).hexdigest()

def state_dir(root):
    d = os.path.join(root, ".claude", "state", "reply-lock")
    os.makedirs(d, exist_ok=True)
    return d

APPROVAL_TTL = 3600

def load_approvals(root):
    f = os.path.join(state_dir(root), "approved.jsonl")
    out = []
    if os.path.exists(f):
        with open(f) as fh:
            for line in fh:
                try:
                    e = json.loads(line)
                    if time.time() - e.get("ts", 0) < APPROVAL_TTL:
                        out.append(e)
                except Exception:
                    pass
    return out

def save_approvals(root, entries):
    with open(os.path.join(state_dir(root), "approved.jsonl"), "w") as fh:
        for e in entries[-30:]:
            fh.write(json.dumps(e) + "\n")

def record_approval(root, text):
    entries = load_approvals(root)
    entries.append({"h": norm_hash(text), "ts": time.time()})
    save_approvals(root, entries)

def consume_approval(root, text):
    h = norm_hash(text)
    entries = load_approvals(root)
    keep = [e for e in entries if e["h"] != h]
    if len(keep) != len(entries):
        save_approvals(root, keep)
        return True
    return False

BANNED = ["good catch", "good question", "your instincts are right", "one honest answer",
          "worse than you thought", "that sharpens it", "should work",
          "tldr"]

def is_short(text):
    # Owner 08-04: a tiny reply ("Yes, all done.") skips the grader entirely —
    # no pre-check task, no wait. The instant word scan still applies.
    lines = [l for l in text.splitlines() if l.strip()]
    return len(lines) <= 2 and len(text) <= 240

def word_scan(text):
    prose = re.sub(r"```.*?```", "", text, flags=re.S)
    fails = []
    low = prose.lower()
    REASON = {"should work": "banned: prove it or say NOT verified",
              "tldr": "banned label (rule 1, owner 08-04): the answer is just the first line, never labeled TLDR"}
    for p in BANNED:
        if p in low:
            fails.append(f"banned phrase \"{p}\" ({REASON.get(p, 'flattery/filler, rule 7')})")
    if "—" in prose or re.search(r"(?<=\S) - (?=\S)", prose):
        fails.append("dashes inside sentences (rule 4: full plain sentences, no dashes)")
    lines = sum(max(1, -(-len(l.rstrip()) // 90)) for l in prose.splitlines() if l.strip())
    if lines > 15:
        fails.append(f"reply is about {lines} lines, over the 15 line limit (rule 9: "
                     "one screen — the answer and the decisions; he asks if he wants more)")
    return fails

def reader_check(root, text, timeout=90):
    src = os.path.join(root, ".claude", "output-styles", "check-owner-reply.md")
    raw = open(src).read()
    rules = re.sub(r"^---.*?---\s*", "", raw, flags=re.S)
    prompt = (
        "You are the owner's DEDICATED WRITER, the second half of the reply lock. "
        "Below are THE LOCKED REPLY RULES, then a DRAFT from a working agent whose "
        "only job was getting the facts right — styling it for the owner is YOUR "
        "job, not theirs, so expect the draft to be rough or technical. You know "
        "NOTHING about the chat it came from; read it cold, exactly as the owner "
        "would on his phone. If the draft ALREADY follows every rule and reads "
        "like one friend texting another, pass it unchanged. Otherwise rewrite it "
        "whole: answer first, his points in his order as a flowing conversation, "
        "everyday sentences a five year old could follow (ELI5, the owner's own "
        "bar), lexicon names for the system's things, zero flattery or filler, "
        "nothing he did not need. Keep every fact, number, name, and decision "
        "exactly as the draft states them — invent nothing, drop no decision. "
        "Rule 9 (the 15 line limit) is measured by a separate machine count — "
        "never judge length or wrapping yourself. Quoting the owner's own words "
        "back to him is always allowed. Never use a dash of any kind inside a "
        "sentence; use a comma or a period. Answer with ONLY this JSON, nothing else:\n"
        '{"pass": true|false, "failures": ["rule N: short plain reason", ...], '
        '"rewrite": "the corrected full reply, empty when pass is true"}\n\n'
        "=== THE LOCKED REPLY RULES ===\n" + rules +
        "\n=== THE REPLY TO GRADE ===\n" + text
    )
    env = dict(os.environ, REPLY_LOCK_INNER="1")
    def run(extra):
        return subprocess.run(
            ["claude", "-p", "--output-format", "text"] + extra,
            input=prompt, capture_output=True, text=True, timeout=timeout,
            cwd="/tmp", env=env)
    # Sonnet first (owner 08-04: the strongest writer grades and writes the fix).
    r = run(["--model", "claude-sonnet-5"])
    if r.returncode != 0:
        r = run(["--model", "claude-haiku-4-5-20251001"])
    out = (r.stdout or "").strip()
    m = re.search(r"\{.*\}", out, flags=re.S)
    verdict = json.loads(m.group(0)) if m else None
    if r.returncode != 0 or verdict is None:
        raise RuntimeError(f"rc={r.returncode} out={out[:200]} err={(r.stderr or '')[:200]}")
    if verdict.get("pass", False):
        return [], ""
    fails = [str(f) for f in (verdict.get("failures") or ["reader check failed the reply"])]
    return fails, str(verdict.get("rewrite") or "")

def grade(root, text, timeout=90):
    fails = word_scan(text)
    if fails:
        return fails, ""
    try:
        return reader_check(root, text, timeout)
    except Exception as ex:
        with open(os.path.join(state_dir(root), "last-error"), "w") as fh:
            fh.write(str(ex))
        return [], ""

# ---- PRE-CHECK MODE ------------------------------------------------------------------
if "--check-file" in sys.argv:
    path = sys.argv[sys.argv.index("--check-file") + 1]
    root = DEF_ROOT
    text = open(path).read().strip()
    if not text:
        print("empty draft"); sys.exit(2)
    if is_short(text):
        if word_scan(text):
            print("VERDICT: NOT SENDABLE. Broken: " + "; ".join(word_scan(text)))
            print("Fix the wording and send; short replies need no other check.")
            sys.exit(0)
        record_approval(root, text)
        print("VERDICT: APPROVED (short reply, no grading needed). Send it.")
        sys.exit(0)
    fails, rewrite = grade(root, text)
    strikes_f = os.path.join(state_dir(root), "precheck-strikes")
    if fails:
        strikes = 0
        if os.path.exists(strikes_f):
            try:
                strikes = int(open(strikes_f).read().strip() or 0)
            except Exception:
                strikes = 0
        strikes += 1
        # The one-pass path: the grader's own fix is pre-approved. Send it if the
        # facts survived; otherwise correct the facts and check once more.
        # A rewrite that only trips the dash rule gets cleaned, not thrown away
        # (08-05: a good rewrite died over one hyphen and the flow broke).
        if rewrite and word_scan(rewrite):
            cleaned = rewrite.replace("\u2014", ", ")
            cleaned = cleaned.replace(" - ", ", ")
            if not word_scan(cleaned):
                rewrite = cleaned
        if rewrite and not word_scan(rewrite):
            if os.path.exists(strikes_f):
                os.remove(strikes_f)
            record_approval(root, rewrite)
            print("VERDICT: NOT SENDABLE AS WRITTEN. Broken: " + "; ".join(fails))
            print("A corrected version is below, ALREADY APPROVED. Read it once: if every "
                  "fact, number, and decision survived, send EXACTLY this text. If a fact "
                  "is wrong, fix only that and run the check once on the fixed file.\n")
            print(rewrite)
            sys.exit(0)
        # No usable fix came back — the escape valve keeps the chat from going mute.
        # Owner 08-04: no stamp, no critique in his face; the reply just goes as is
        # and the grader's reasons land in a log only agents read.
        if strikes >= 3:
            os.remove(strikes_f)
            record_approval(root, text)
            with open(os.path.join(state_dir(root), "last-third-strike"), "w") as fh:
                fh.write("; ".join(fails))
            print("VERDICT: THIRD STRIKE, SEND YOUR DRAFT AS IS. It is approved; send "
                  "exactly your draft text and stop.")
            sys.exit(0)
        with open(strikes_f, "w") as fh:
            fh.write(str(strikes))
        print("VERDICT: NOT SENDABLE. Broken: " + "; ".join(fails))
        print("This is not an error and retrying changes nothing. EDIT the draft to fix "
              "what is named above, then run the check once on the edited file.")
        sys.exit(0)
    if os.path.exists(strikes_f):
        os.remove(strikes_f)
    record_approval(root, text)
    print("VERDICT: APPROVED. Send this exact text as your reply — word for word. The "
          "reply lock will recognize it and let it straight through.")
    sys.exit(0)

# ---- STOP HOOK MODE ------------------------------------------------------------------
if os.environ.get("REPLY_LOCK_INNER"):
    sys.exit(0)
root = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else DEF_ROOT
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
tpath = data.get("transcript_path") or ""
if not tpath or not os.path.exists(tpath):
    sys.exit(0)

reply = None
try:
    with open(tpath) as fh:
        for line in fh:
            try:
                e = json.loads(line)
            except Exception:
                continue
            if e.get("type") != "assistant" or e.get("isSidechain"):
                continue
            blocks = ((e.get("message") or {}).get("content")) or []
            txt = "\n".join(b.get("text", "") for b in blocks if isinstance(b, dict) and b.get("type") == "text").strip()
            if txt:
                reply = txt
except Exception:
    sys.exit(0)
if not reply:
    sys.exit(0)

sid = data.get("session_id") or hashlib.sha1(tpath.encode()).hexdigest()[:12]
cfile = os.path.join(state_dir(root), f"{sid}.count")
count = 0
if os.path.exists(cfile):
    try:
        count = int(open(cfile).read().strip() or 0)
    except Exception:
        count = 0

def allow_reset():
    if os.path.exists(cfile):
        os.remove(cfile)
    sys.exit(0)

def block(msg):
    with open(cfile, "w") as fh:
        fh.write(str(count + 1))
    sys.stderr.write(msg)
    sys.exit(2)

# The pre-checked path: an approved reply sails through with no grader call.
if consume_approval(root, reply):
    allow_reset()
if reply.startswith("FAILED THE RULES"):
    allow_reset()
if count >= 3:
    allow_reset()

if is_short(reply):
    if not word_scan(reply):
        allow_reset()
    fails, rewrite = word_scan(reply), ""
else:
    fails, rewrite = grade(root, reply, timeout=40)
if not fails:
    allow_reset()

names = "; ".join(fails)
# Third grading failure: let it stand. His screen already shows the reply; adding a
# stamp or critique only makes him read machinery (owner 08-04).
if count >= 2:
    with open(os.path.join(state_dir(root), "last-third-strike"), "w") as fh:
        fh.write(names)
    allow_reset()
block(
    "REPLY LOCK: this reply does not reach the owner unbounced. Broken: " + names + "\n"
    "The owner has ALREADY SEEN the text you just wrote — never resend it or a light "
    "rewording of it. Next time PRE-CHECK before replying: write the draft to a file, run "
    "bash scripts/check-reply.sh <file>, fix until APPROVED, send that exact text. For "
    "THIS turn: send ONLY what changes or corrects your last message in as few lines as "
    "possible (never repeat what already passed his screen), pre-checked the same way, "
    "then stop.\n")
```


Also registered in the same settings file and included for completeness (not part of the reply lock): the other Stop hook and the every-turn rules paste.


---

## FILE: .claude/hooks/doc-caps-stop.sh

```
#!/usr/bin/env bash
# Stop hook (REBUILD_PLAN 2026-07-22, Phase 5/6): a session cannot close while any living doc
# is over its hard cap. Runs the doc-cap gate; over cap = exit 2 blocks the stop and tells the
# agent to prune. stop_hook_active guards against an infinite stop loop. The standing rule the
# agent still owns: update STATE.md + your system checkpoint before you close.
d="${CLAUDE_PROJECT_DIR:-.}"
input=$(cat 2>/dev/null)
active=$(printf '%s' "$input" | python3 -c "import sys,json; print(json.load(sys.stdin).get('stop_hook_active', False))" 2>/dev/null)
[ "$active" = "True" ] && exit 0

cd "$d" || exit 0
if ! out=$(bash scripts/checkpoint-lint.sh 2>&1); then
  {
    echo "$out"
    echo "Session close blocked: prune the doc(s) above under cap, then stop again."
  } >&2
  exit 2
fi
exit 0
```


---

## FILE: .claude/hooks/three-rules.sh

```
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
```


---

# 5. One real example, end to end (from the owner's PM chat, 2026-08-05)

## 5a. The owner's message

```
I don't know why I have to say flip it but just give me that shit if you think it's gonna work tested here

pull staging, then reply to me correctly
```

## 5b. The working agent's draft (facts only, written to a scratch file)

```
Flip is built and live on staging as of this commit. New flow: working agent writes a facts-only draft file, no styling effort. The checker component (Sonnet 5) is now prompted as the owner's dedicated writer instead of a grader: if draft already reads right it passes unchanged, otherwise it rewrites the whole thing in the owner's style (answer first, conversational order, ELI5 register, lexicon terms, no filler) preserving all facts/numbers/decisions, and that rewrite comes back pre-approved. Working agent verifies facts survived, sends. ELI5 added verbatim to rule 4 of the locked rules file. Also relevant: this very reply was produced through the new flow, the text the owner is reading was written by the dedicated writer from this rough technical draft. His open chats still need the "pull staging, then send me your last reply" line once each to pick the flip up.
```

## 5c. The reviewer's output, run 1 (before a same-day fix: the rewrite was
discarded because it contained a spaced hyphen, so only the verdict returned)

```
VERDICT: NOT SENDABLE. Broken: rule 3: uses invented computer labels like 'checker component', 'working agent', 'draft file', 'styling effort', 'Sonnet 5', 'pre-approved' instead of plain lexicon-friendly words; rule 4: reads like an engineering changelog, not a simple friend-to-friend ELI5 explanation; rule 2: dumps the update as a technical report instead of a flowing conversation in his order
This is not an error and retrying changes nothing. EDIT the draft to fix what is named above, then run the check once on the edited file.
```

## 5d. The reviewer's output, run 2 (same draft, after the fix)

```
VERDICT: NOT SENDABLE AS WRITTEN. Broken: rule 3: uses invented jargon like 'facts-only draft', 'checker component', 'styling effort', 'pre-approved' instead of plain words; rule 4: written like an engineering changelog, not simple five year old level sentences a friend would text; rule 7: 'New flow:' is a headline label setting up what follows, which isn't allowed
A corrected version is below, ALREADY APPROVED. Read it once: if every fact, number, and decision survived, send EXACTLY this text. If a fact is wrong, fix only that and run the check once on the fixed file.

Flip is built and live on staging.

Here's what changed. From now on, one agent just writes down the plain facts, no effort to make it read nice. Then a second agent, the writer, turns that into a reply for you in your style: answer first, your points in order, plain and simple, using our normal names for things, keeping every fact and number exactly as they were. If the plain facts version already reads right, the writer leaves it alone. If not, the writer rewrites the whole thing and it comes back already approved, ready to send. Before it goes out, the first agent checks that no facts got lost or changed along the way.

The explain it like I'm five rule got added to the rule book exactly the way you said it.

This very reply was made that way. The rough draft got turned into what you're reading now by the writer.

Your other open chats each need the line pull staging, then send me your last reply sent once, so they pick up Flip too.
```

## 5e. The final reply shown to the owner

Identical, word for word, to the corrected version in 5d starting at
"Flip is built and live on staging." and ending at "...so they pick up Flip too."


---

# 6. Output of: find .claude -maxdepth 3 -type f -print

```
.claude/allowed-paths
.claude/skills/unblock-yourself/SKILL.md
.claude/skills/known-problems/SKILL.md
.claude/skills/ship-it/SKILL.md
.claude/skills/build-on-brand/SKILL.md
.claude/settings.local.json
.claude/settings.json
.claude/hooks/sprawl-gate.py
.claude/hooks/doc-caps-stop.sh
.claude/hooks/work-counter.sh
.claude/hooks/edit-gate.sh
.claude/hooks/reply-lock.sh
.claude/hooks/edit-gate.py
.claude/hooks/nav-gate.sh
.claude/hooks/push-gate.sh
.claude/hooks/three-rules.sh
.claude/hooks/sprawl-gate.sh
.claude/hooks/nav-gate.py
.claude/hooks/copy-gate.sh
.claude/hooks/reply-lock.py
.claude/hooks/index-regen.sh
.claude/hooks/turn-counter.sh
.claude/hooks/copy-gate.py
.claude/output-styles/check-owner-reply.md
.claude/nav-allowlist
.claude/state/reply-lock/last-error
.claude/state/reply-lock/approved.jsonl
.claude/locks
```
