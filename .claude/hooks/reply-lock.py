#!/usr/bin/env python3
# THE REPLY LOCK (owner-designed, locked 2026-08-04). Stop hook: no reply reaches the
# owner until it passes the locked reply rules (.claude/output-styles/check-owner-reply.md).
# Layer 1: word scan (banned flattery/filler, dashes, "should work") — instant, no cost.
# Layer 2: reader check — a second agent reads the reply COLD, knowing nothing from the
# chat, and fails anything it cannot understand or that breaks a rule. Runs via
# `claude -p` from /tmp so this repo's hooks never load inside it (no recursion).
# Fail = exit 2 bounces the reply back with the broken rules named; the agent rewrites
# and stops again. After 3 fails the reply goes through stamped FAILED THE RULES so
# nothing ever sticks silently. Reader errors fail OPEN (word scan still binds) and are
# logged to .claude/state/reply-lock/last-error.
import sys, json, os, re, hashlib, subprocess

if os.environ.get("REPLY_LOCK_INNER"):
    sys.exit(0)

root = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else "."
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

tpath = data.get("transcript_path") or ""
if not tpath or not os.path.exists(tpath):
    sys.exit(0)

# ---- pull the last reply (last non-sidechain assistant text) -------------------------
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

# ---- retry / stamp state -------------------------------------------------------------
sid = data.get("session_id") or hashlib.sha1(tpath.encode()).hexdigest()[:12]
sdir = os.path.join(root, ".claude", "state", "reply-lock")
os.makedirs(sdir, exist_ok=True)
cfile = os.path.join(sdir, f"{sid}.count")
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

# A stamped reply is the agreed last resort — let it through, reset the counter.
if reply.startswith("FAILED THE RULES"):
    allow_reset()
if count >= 3:
    allow_reset()

# ---- layer 1: word scan (prose only — fenced code blocks are payload) ----------------
prose = re.sub(r"```.*?```", "", reply, flags=re.S)
fails = []
BANNED = ["good catch", "good question", "your instincts are right", "one honest answer",
          "worse than you thought", "that sharpens it", "should work"]
low = prose.lower()
for p in BANNED:
    if p in low:
        fails.append(f"banned phrase \"{p}\" (rule 7, or \"should work\": prove it or say NOT verified)")
if "—" in prose or re.search(r"(?<=\S) - (?=\S)", prose):
    fails.append("dashes inside sentences (rule 4: full plain sentences, no dashes)")

# ---- layer 2: reader check (only when the word scan is clean) ------------------------
if not fails:
    src = os.path.join(root, ".claude", "output-styles", "check-owner-reply.md")
    try:
        raw = open(src).read()
        rules = re.sub(r"^---.*?---\s*", "", raw, flags=re.S)
        prompt = (
            "You are the READER CHECK for the reply lock. Below are THE LOCKED REPLY "
            "RULES, then a reply an agent wants to send the owner. You know NOTHING "
            "about the chat it came from — read the reply cold, exactly as the owner "
            "would on his phone. Fail it if any line needs decoding, breaks a numbered "
            "rule, uses a term that is not in the lexicon and not plainly explained, "
            "overexplains, or raises a non-issue. Judge only against the rules; do not "
            "invent standards. Quoted DON'T examples inside the reply are not "
            "violations. Answer with ONLY this JSON, nothing else:\n"
            '{"pass": true|false, "failures": ["rule N: short plain reason", ...]}\n\n'
            "=== THE LOCKED REPLY RULES ===\n" + rules +
            "\n=== THE REPLY TO GRADE ===\n" + reply
        )
        env = dict(os.environ, REPLY_LOCK_INNER="1")
        def run(extra):
            return subprocess.run(
                ["claude", "-p", "--output-format", "text"] + extra,
                input=prompt, capture_output=True, text=True, timeout=90,
                cwd="/tmp", env=env)
        r = run(["--model", "claude-sonnet-5"])
        if r.returncode != 0:
            r = run([])
        out = (r.stdout or "").strip()
        m = re.search(r"\{.*\}", out, flags=re.S)
        verdict = json.loads(m.group(0)) if m else None
        if r.returncode == 0 and verdict is not None:
            if not verdict.get("pass", False):
                fails += [str(f) for f in (verdict.get("failures") or ["reader check failed the reply"])]
        else:
            raise RuntimeError(f"rc={r.returncode} out={out[:200]} err={(r.stderr or '')[:200]}")
    except Exception as ex:
        with open(os.path.join(sdir, "last-error"), "w") as fh:
            fh.write(str(ex))

if not fails:
    allow_reset()

names = "; ".join(fails)
if count >= 2:
    block(
        "REPLY LOCK: third failure. Send the reply anyway, but its FIRST line must be "
        f"exactly: FAILED THE RULES: {names}\nThen the reply unchanged. Stop again after.\n")
block(
    "REPLY LOCK: this reply does not reach the owner. Broken: " + names + "\n"
    "Rewrite the reply so it passes the locked reply rules "
    "(.claude/output-styles/check-owner-reply.md), then stop again. Do not mention "
    "this check or the rewrite in the reply.\n")
