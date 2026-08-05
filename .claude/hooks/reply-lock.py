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
