#!/usr/bin/env python3
# THE REPLY LOCK (owner-designed, locked 2026-08-04). No reply reaches the owner until it
# passes the locked reply rules (.claude/output-styles/check-owner-reply.md).
# Layer 1: word scan (banned flattery/filler, dashes, "should work") — instant, no cost.
# Layer 2: reader check — a second agent reads the reply COLD, knowing nothing from the
# chat, and fails anything it cannot understand or that breaks a rule. Runs via
# `claude -p` from /tmp so this repo's hooks never load inside it (no recursion).
#
# TWO MODES (the 08-04 duplicate fix — a Stop-time bounce happens AFTER the text is on
# the owner's screen, so every bounce used to show him the same reply twice):
#   --check-file <path>  PRE-CHECK. Agents grade their DRAFT here before sending. On pass
#                        the draft's hash is recorded as approved; the agent then sends
#                        that exact text and the Stop hook waves it through silently.
#                        This is the normal path: the owner sees ONE reply, ever.
#   (no flag, stdin)     STOP HOOK backstop. Approved hash → instant pass. Otherwise
#                        grade now; fail = exit 2 bounces with the broken rules named
#                        (visible duplicate — only rule-skippers pay it). After 3 fails
#                        the reply goes through stamped FAILED THE RULES.
# Reader errors fail OPEN (word scan still binds); logged to state/reply-lock/last-error.
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
          "worse than you thought", "that sharpens it", "should work"]

def word_scan(text):
    prose = re.sub(r"```.*?```", "", text, flags=re.S)
    fails = []
    low = prose.lower()
    for p in BANNED:
        if p in low:
            fails.append(f"banned phrase \"{p}\" (rule 7, or \"should work\": prove it or say NOT verified)")
    if "—" in prose or re.search(r"(?<=\S) - (?=\S)", prose):
        fails.append("dashes inside sentences (rule 4: full plain sentences, no dashes)")
    lines = sum(max(1, -(-len(l.rstrip()) // 90)) for l in prose.splitlines() if l.strip())
    if lines > 15:
        fails.append(f"reply is about {lines} lines, over the 15 line limit (rule 9: "
                     "one screen — the answer and the decisions; he asks if he wants more)")
    return fails

def reader_check(root, text):
    src = os.path.join(root, ".claude", "output-styles", "check-owner-reply.md")
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
        "\n=== THE REPLY TO GRADE ===\n" + text
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
    if r.returncode != 0 or verdict is None:
        raise RuntimeError(f"rc={r.returncode} out={out[:200]} err={(r.stderr or '')[:200]}")
    if verdict.get("pass", False):
        return []
    return [str(f) for f in (verdict.get("failures") or ["reader check failed the reply"])]

def grade(root, text):
    fails = word_scan(text)
    if fails:
        return fails
    try:
        return reader_check(root, text)
    except Exception as ex:
        with open(os.path.join(state_dir(root), "last-error"), "w") as fh:
            fh.write(str(ex))
        return []

# ---- PRE-CHECK MODE ------------------------------------------------------------------
if "--check-file" in sys.argv:
    path = sys.argv[sys.argv.index("--check-file") + 1]
    root = DEF_ROOT
    text = open(path).read().strip()
    if not text:
        print("empty draft"); sys.exit(2)
    fails = grade(root, text)
    if fails:
        print("REPLY LOCK PRE-CHECK: not sendable. Broken: " + "; ".join(fails))
        print("Fix the draft and run the check again. Only send text that passed.")
        sys.exit(2)
    record_approval(root, text)
    print("APPROVED. Send this exact text as your reply — word for word. The reply "
          "lock will recognize it and let it straight through.")
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

# The pre-checked path: an approved draft sails through with no reader call.
if consume_approval(root, reply):
    allow_reset()
if reply.startswith("FAILED THE RULES"):
    allow_reset()
if count >= 3:
    allow_reset()

fails = grade(root, reply)
if not fails:
    allow_reset()

names = "; ".join(fails)
if count >= 2:
    block(
        "REPLY LOCK: third failure. Send the reply anyway, but its FIRST line must be "
        f"exactly: FAILED THE RULES: {names}\nThen the reply unchanged. Stop again after.\n")
block(
    "REPLY LOCK: this reply does not reach the owner unbounced. Broken: " + names + "\n"
    "The owner has ALREADY SEEN the text you just wrote — never resend it or a light "
    "rewording of it. Next time PRE-CHECK before replying: write the draft to a file, run "
    "bash scripts/check-reply.sh <file>, fix until APPROVED, send that exact text. For "
    "THIS turn: send ONLY what changes or corrects your last message in as few lines as "
    "possible (never repeat what already passed his screen), pre-checked the same way, "
    "then stop.\n")
