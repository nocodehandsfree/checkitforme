#!/usr/bin/env python3
# THE REPLY LOCK (owner-designed 2026-08-04; renderer architecture agreed with two AI
# reviews and the owner's "go" 2026-08-05). No reply reaches the owner until it passes.
#
# THE FLOW (pre-check, scripts/check-reply.sh):
#   1. The working agent writes its best complete answer normally (facts, numbers,
#      names, decisions, uncertainty, exact quotes intact). No style effort needed.
#   2. Short reply (2 lines or less): word scan only, instant approve.
#   3. Otherwise the RENDERER (Sonnet) gets ONLY: the owner's latest message (saved
#      per session by the UserPromptSubmit hook), the answer, a short description of
#      how the owner communicates, the lexicon, and up to 4 similar stored examples
#      (.claude/reply-examples/, approved replies and bad+fixed pairs from the owner).
#      Its first question: would a person text this to a friend. It approves the
#      answer unchanged or rewrites it in the owner's voice, adding nothing.
#   4. MECHANICAL CHECK (hard guarantee): every number token, code span, fenced code
#      block, path, and url in the answer must appear intact in the rendering.
#   5. MEANING CHECK (judgment, Haiku): anything added, removed, softened,
#      strengthened, or changed fails the rendering.
#   6. A rendering that fails 4 or 5 gets ONE retry with the misses named. Still
#      failing = FAIL OPEN: the agent's own answer is approved (word scan only).
#      A broken or slow renderer can never mute or hang a chat.
#   7. The approved text is fingerprinted; the Stop hook lets it through silently.
#      This flow keeps the stored conversation identical to what the owner saw.
# HONEST LIMIT (both reviews agree): this makes replies more natural and consistent;
# it CANNOT guarantee every reply sounds human. A true guarantee needs a separate
# Agent SDK app controlling both display and the stored conversation.
#
# Stop-hook mode stays the BACKUP for unapproved text only: approved hash or short
# reply passes instantly; unapproved text is graded (capped wait); a failure bounces
# visibly (the cost of skipping the flow); 3 fails = it stands, reasons go to a log.
# All state lives under .claude/state/reply-lock/. One container = one session in
# cloud chats; prompts are keyed by session id, strikes by draft directory, so two
# sessions sharing one working copy on a desktop stay isolated too.
import sys, json, os, re, time, glob, hashlib, subprocess

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
    bolds = re.findall(r"\*\*(.+?)\*\*", prose, flags=re.S)
    if len(bolds) > 3:
        fails.append(f"{len(bolds)} bold bits (rule 10: at most 3, one short label per "
                     "separate thing, so the bold actually stands out)")
    for b in bolds:
        if len(b) > 60 or re.search(r"[.!?]\s", b):
            fails.append("a whole sentence is bold (rule 10: bold is a SHORT label on its "
                         f"own line, never a sentence): \"{b[:50]}...\"")
            break
    if re.search(r"^\s*#{1,6}\s", prose, flags=re.M):
        fails.append("headings (rule 10: never on a reply this short, he is on a phone)")
    if re.search(r"^\s*(---|\*\*\*|___)\s*$", prose, flags=re.M):
        fails.append("a divider line (rule 10: never)")
    if bolds and is_short(text):
        fails.append("bold on a quick answer (rule 10: a sentence or two carries no bold)")
    paras = [b for b in re.split(r"\n\s*\n", prose) if b.strip()]
    if not bolds and len(paras) >= 3 and not is_short(text):
        fails.append(f"{len(paras)} paragraphs and NO bold labels (rule 10: when a reply "
                     "covers 2 or 3 separate things, each gets a short bold label on its "
                     "own line so he can scroll and find the part he cares about)")
    lines = sum(max(1, -(-len(l.rstrip()) // 90)) for l in prose.splitlines() if l.strip())
    if lines > 15:
        fails.append(f"reply is about {lines} lines, over the 15 line limit (rule 9: "
                     "one screen — the answer and the decisions; he asks if he wants more)")
    return fails

def clean_dashes(text):
    cleaned = text.replace("—", ", ")
    return re.sub(r"(?<=\S) - (?=\S)", ", ", cleaned)

STYLE = (
    "The owner runs the whole business from his phone. He reads like a smart friend "
    "who does not work here. Answer first, his points in his order, short flowing "
    "everyday sentences a five year old could follow (his word for it: ELI5). "
    "Numbers stay as digits. Use the system's own names from the lexicon; a thing "
    "with no name gets described simply, never nicknamed. No computer speak, no "
    "invented labels, no metaphors or clever phrasing, no dashes inside sentences, "
    "no flattery, no filler, no headlines before answers, nothing he did not ask "
    "about. Background only when he has a decision to make. Text he asked to see is "
    "quoted exactly. Code blocks appear only for a prompt he will relay or when he "
    "asked for one. FORMATTING (measured 08-05 from how a plain Claude writes to "
    "someone on a phone): a quick answer of a sentence or two carries NO bold at "
    "all. When the reply covers 2 or 3 separate things, give each one a SHORT bold "
    "label alone on its own line with a plain paragraph under it, so he can scroll "
    "and find what he cares about. Never more than 3 bold bits, never a bold "
    "sentence, never headings, never divider lines, never bullets just to look "
    "organized."
)

def lexicon(root):
    src = os.path.join(root, ".claude", "output-styles", "check-owner-reply.md")
    raw = open(src).read()
    m = re.search(r"# THE LEXICON\n(.*)", raw, flags=re.S)
    return m.group(1).strip() if m else ""

def load_examples(root, owner_msg, draft, limit=4):
    # Similarity by plain word overlap — crude on purpose, no giant prompt (owner 08-05).
    query = set(w.lower() for w in re.findall(r"[a-zA-Z]{4,}", owner_msg + " " + draft))
    scored = []
    for f in sorted(glob.glob(os.path.join(root, ".claude", "reply-examples", "*.md"))):
        body = open(f).read()
        words = set(w.lower() for w in re.findall(r"[a-zA-Z]{4,}", body))
        scored.append((len(query & words), body))
    scored.sort(key=lambda x: -x[0])
    return [b for s, b in scored[:limit] if s > 0]

def run_claude(prompt, model, timeout):
    env = dict(os.environ, REPLY_LOCK_INNER="1")
    return subprocess.run(["claude", "-p", "--output-format", "text", "--model", model],
                          input=prompt, capture_output=True, text=True,
                          timeout=timeout, cwd="/tmp", env=env)

def parse_json(out):
    m = re.search(r"\{.*\}", out or "", flags=re.S)
    return json.loads(m.group(0)) if m else None

def log_error(root, ex):
    with open(os.path.join(state_dir(root), "last-error"), "w") as fh:
        fh.write(str(ex))

def render(root, owner_msg, draft, notes="", timeout=90):
    examples = load_examples(root, owner_msg, draft)
    ex_text = ""
    for i, e in enumerate(examples, 1):
        ex_text += f"\n--- EXAMPLE {i} (real, from the owner's chats) ---\n{e}\n"
    prompt = (
        "You are the owner's dedicated writer. Below: how the owner communicates, "
        "the lexicon of the system's real names, a few real examples from his "
        "chats, his latest message, and a working agent's complete answer. FIRST "
        "judge it against HIS LATEST MESSAGE: does it answer what he actually "
        "asked? Cut every part that is not the answer, a decision he has to make, "
        "or something he asked about, however true that part is. If it never "
        "answers him, rewrite so the answer comes first. THEN judge every "
        "sentence: would a person actually text this to a friend? And judge the "
        "shape: when the reply covers 2 or more separate things you MUST give each "
        "one a SHORT bold label alone on its own line with a plain paragraph under "
        "it. Pass the draft unchanged ONLY if it answers him, reads like one friend "
        "texting another, and already carries those labels. Otherwise rewrite it "
        "fully in the owner's style. Keep every fact, number (as digits), name, "
        "date, path, command, "
        "quote, code block, decision, and instruction EXACTLY. Add nothing, drop "
        "nothing, soften nothing, strengthen nothing. Never use a dash inside a "
        "sentence. Answer with ONLY this JSON:\n"
        '{"pass": true|false, "rewrite": "full corrected reply, empty when pass"}\n'
        + ("\nFIX ALSO: " + notes + "\n" if notes else "") +
        "\n=== HOW THE OWNER COMMUNICATES ===\n" + STYLE +
        "\n\n=== THE LEXICON ===\n" + lexicon(root) +
        "\n\n=== EXAMPLES ===\n" + (ex_text or "(none stored yet)") +
        "\n\n=== THE OWNER'S LATEST MESSAGE ===\n" + (owner_msg or "(not captured)") +
        "\n\n=== THE WORKING AGENT'S ANSWER ===\n" + draft
    )
    r = run_claude(prompt, "claude-sonnet-5", timeout)
    if r.returncode != 0:
        r = run_claude(prompt, "claude-haiku-4-5-20251001", timeout)
    v = parse_json(r.stdout)
    if r.returncode != 0 or v is None:
        raise RuntimeError(f"renderer rc={r.returncode} out={(r.stdout or '')[:200]}")
    if v.get("pass"):
        return draft
    return clean_dashes(str(v.get("rewrite") or "")) or draft

def extract_tokens(text):
    body = text
    fences = re.findall(r"```.*?```", body, flags=re.S)
    prose = re.sub(r"```.*?```", "", body, flags=re.S)
    toks = set()
    toks.update(re.findall(r"\d[\d,.:%]*", prose))              # numbers as digits
    toks.update(re.findall(r"`[^`\n]+`", prose))                # code spans
    toks.update(re.findall(r"[\w.-]+/[\w./-]+", prose))         # paths
    toks.update(re.findall(r"https?://\S+", prose))             # urls
    return toks, fences

def mechanical_misses(draft, rendered):
    toks, fences = extract_tokens(draft)
    flat = " ".join(rendered.split())
    missing = [t for t in toks if " ".join(t.split()) not in flat]
    missing += [f"code block {i+1}" for i, f in enumerate(fences)
                if " ".join(f.split()) not in flat]
    return missing

def meaning_check(root, owner_msg, draft, rendered, timeout=60):
    prompt = (
        "Compare ORIGINAL and REWRITE, written to answer the OWNER MESSAGE. Did "
        "the rewrite add, remove, soften, strengthen, or change ANY fact, number, "
        "decision, instruction, or uncertainty? Wording may differ freely; meaning "
        "may not. Answer ONLY JSON: {\"faithful\": true|false, \"problems\": [\"...\"]}\n"
        "\n=== OWNER MESSAGE ===\n" + (owner_msg or "(not captured)") +
        "\n\n=== ORIGINAL ===\n" + draft + "\n\n=== REWRITE ===\n" + rendered
    )
    r = run_claude(prompt, "claude-haiku-4-5-20251001", timeout)
    v = parse_json(r.stdout)
    if r.returncode != 0 or v is None:
        raise RuntimeError(f"meaning check rc={r.returncode}")
    return bool(v.get("faithful")), [str(p) for p in (v.get("problems") or [])]

def latest_owner_msg(root):
    d = os.path.join(state_dir(root), "prompts")
    files = sorted(glob.glob(os.path.join(d, "*.txt")), key=os.path.getmtime)
    if not files:
        return ""
    try:
        return open(files[-1]).read().strip()
    except Exception:
        return ""

# ---- PRE-CHECK MODE ------------------------------------------------------------------
if "--check-file" in sys.argv:
    path = os.path.abspath(sys.argv[sys.argv.index("--check-file") + 1])
    root = DEF_ROOT
    draft = open(path).read().strip()
    if not draft:
        print("empty draft"); sys.exit(2)

    if is_short(draft):
        fails = word_scan(draft)
        if fails:
            print("VERDICT: NOT SENDABLE. Broken: " + "; ".join(fails))
            print("Fix the wording and send; short replies need no other check.")
            sys.exit(0)
        record_approval(root, draft)
        print("VERDICT: APPROVED (short reply, no rendering needed). Send it.")
        sys.exit(0)

    owner_msg = latest_owner_msg(root)

    def fail_open(reason):
        # A broken renderer can never mute or hang the chat (owner + both reviews).
        fails = word_scan(draft)
        if fails:
            print("VERDICT: NOT SENDABLE. The renderer is unavailable (" + reason + ") "
                  "and your answer breaks hard rules: " + "; ".join(fails))
            print("Fix those in your own words and run the check once more.")
            sys.exit(0)
        record_approval(root, draft)
        print("VERDICT: APPROVED AS WRITTEN (renderer unavailable: " + reason + "). "
              "Send your answer exactly as drafted.")
        sys.exit(0)

    try:
        final = render(root, owner_msg, draft)
    except Exception as ex:
        log_error(root, ex); fail_open("error")
    notes = []
    misses = mechanical_misses(draft, final)
    if word_scan(final):
        notes.append("your rewrite broke hard rules: " + "; ".join(word_scan(final)))
    if misses:
        notes.append("you dropped these exact items, keep them verbatim: " + "; ".join(misses[:10]))
    faithful, problems = True, []
    if not notes:
        try:
            faithful, problems = meaning_check(root, owner_msg, draft, final)
        except Exception as ex:
            log_error(root, ex)
    if not faithful:
        notes.append("meaning drifted: " + "; ".join(problems[:5]))
    if notes:
        try:
            final = render(root, owner_msg, draft, notes=" | ".join(notes))
            if word_scan(final) or mechanical_misses(draft, final):
                fail_open("rewrite kept failing the fact checks")
        except Exception as ex:
            log_error(root, ex); fail_open("error on retry")

    record_approval(root, final)
    if " ".join(final.split()) == " ".join(draft.split()):
        print("VERDICT: APPROVED AS WRITTEN. Send your answer exactly as drafted.")
    else:
        print("VERDICT: APPROVED, RENDERED VERSION BELOW. Every fact was checked "
              "against your answer mechanically and by a meaning pass. Read it once; "
              "if a fact still looks wrong, fix only that fact in your own draft and "
              "run the check again. Otherwise send EXACTLY this text:\n")
        print(final)
    sys.exit(0)

# ---- STOP HOOK MODE (backup only) ----------------------------------------------------
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

if consume_approval(root, reply):
    allow_reset()
if reply.startswith("FAILED THE RULES"):
    allow_reset()
if is_short(reply) and not word_scan(reply):
    allow_reset()
if count >= 2:
    # Third failure: let it stand; reasons go to a log, nothing bolted onto his screen.
    with open(os.path.join(state_dir(root), "last-third-strike"), "w") as fh:
        fh.write("stop-time failures exhausted")
    allow_reset()

fails = word_scan(reply)
if not fails:
    try:
        owner_msg = latest_owner_msg(root)
        final = render(root, owner_msg, reply, timeout=40)
        if " ".join(final.split()) == " ".join(reply.split()):
            allow_reset()
        fails = ["the reply does not read the way the owner's rules require"]
    except Exception as ex:
        log_error(root, ex)
        allow_reset()

block(
    "REPLY LOCK: this reply does not reach the owner unbounced. Broken: " + "; ".join(fails) + "\n"
    "The owner has ALREADY SEEN the text you just wrote — never resend it or a light "
    "rewording of it. Next time run bash scripts/check-reply.sh <draft file> BEFORE "
    "replying and send the approved text. For THIS turn: send ONLY what corrects your "
    "last message, in as few lines as possible, pre-checked the same way, then stop.\n")
