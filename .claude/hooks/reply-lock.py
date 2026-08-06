#!/usr/bin/env python3
# THE REPLY LOCK (owner-designed 2026-08-04; renderer architecture agreed with two AI
# reviews and the owner's "go" 2026-08-05). No reply reaches the owner until it passes.
#
# THE FLOW (pre-check, scripts/check-reply.sh):
#   1. The working agent writes its best complete answer normally (facts, numbers,
#      names, decisions, uncertainty, exact quotes intact). No style effort needed.
#   2. Short reply (4 lines or less, owner widened it from 2 on 08-06): word scan only,
#      instant approve. An answer far
#      past the 25 line limit bounces the same instant: no rewrite saves it, and the
#      agent cutting it costs a second instead of waiting on a model. The one thing the
#      cap does not touch is a piece of work the owner asked to be handed in the chat
#      (rule 11, owner 08-06) — see work_product_asked.
#   3. Otherwise the RENDERER (Sonnet) gets ONLY: the owner's latest message (saved
#      per session by the UserPromptSubmit hook), the answer, a short description of
#      how the owner communicates, the lexicon, and up to 4 similar stored examples
#      (.claude/reply-examples/, approved replies and bad+fixed pairs from the owner).
#      Its first question: would a person text this to a friend. It approves the
#      answer unchanged or rewrites it in the owner's voice, adding nothing.
#   4. MECHANICAL CHECK (hard guarantee): every number token, code span, fenced code
#      block, path, and url in the answer must appear intact in the rendering.
#   5. MEANING CHECK (judgment, Sonnet): anything added, removed, softened,
#      strengthened, or changed fails the rendering. Skipped in exactly one case:
#      the writer handed the answer back word for word, so nothing can have moved.
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
          "tldr",
          # Rule 6 tells: every one of these announces something he did not ask for.
          "worth knowing", "one thing to watch", "one more thing", "unrelated but",
          "you did not ask", "you didn't ask", "just so you know", "for what it's worth",
          "fyi", "heads up", "in case you",
          # Rule 7 tells: setting the answer up with a headline instead of just saying it.
          "here's what", "here is what", "let me explain", "let me walk", "to be clear",
          "the short answer", "the long answer", "bottom line", "in short", "to summarize",
          "to sum up", "here's the thing", "here is the thing", "the good news",
          "the bad news", "first off", "before i get into", "let me start"]

def is_short(text):
    # A QUICK ANSWER, for rule 10 only: this is the reply that carries no bold at all.
    # Tried tightening it to 1 line / 140 chars on 08-05 and the owner called it too
    # tight: rambling is a rule 6 problem, not a length problem, and the fix for it lives
    # in the renderer (cut anything he did not need), not here.
    lines = [l for l in text.splitlines() if l.strip()]
    return len(lines) <= 2 and len(text.strip()) <= 240

def skips_writer(text):
    # THE SPEED BYPASS, widened from 2 lines to 4 on the owner's word (08-06). A simple
    # question with a 3 or 4 line answer was paying about 12 seconds to be rewritten in
    # his voice, which it did not need. Kept SEPARATE from is_short on purpose: a 4 line
    # reply covering 2 things still wants its bold labels, and folding the two together
    # would have started rejecting those for "bold on a quick answer".
    # The word scan still runs here. Only the writer and the meaning pass are skipped.
    lines = [l for l in text.splitlines() if l.strip()]
    return len(lines) <= 4 and len(text.strip()) <= 420

# THE LINE CAP (owner 08-06, raised from 15). At 15 the replies were scrunching words in
# and going thin on the explaining, which is the opposite of rule 4. HARD_STOP is where no
# rewrite is even attempted: it was 22 against a cap of 15, kept at the same distance here.
CAP = 25
HARD_STOP = 35

def count_lines(prose):
    return sum(max(1, -(-len(l.rstrip()) // 90)) for l in prose.splitlines() if l.strip())

def word_scan(text, cap=CAP):
    # cap=None turns OFF the line rule, and NOTHING else. That is rule 11, the one
    # exception the owner locked 08-06: a piece of work he asked to be handed in the chat
    # runs as long as it needs. Every other rule still bites inside it.
    prose = re.sub(r"```.*?```", "", text, flags=re.S)
    fails = []
    low = prose.lower()
    RULE6 = ("rule 6: this announces something he did not ask about. If a decision rides "
             "on it, say the decision plainly. If not, cut it entirely, he asks when he "
             "wants more")
    RULE7 = ("rule 7: nothing ever needs to be set up with a headline. Delete the run-up "
             "and just say the thing")
    REASON = {"should work": "banned: prove it or say NOT verified",
              "tldr": "banned label (rule 1, owner 08-04): the answer is just the first line, never labeled TLDR",
              "worth knowing": RULE6, "one thing to watch": RULE6, "one more thing": RULE6,
              "unrelated but": RULE6, "you did not ask": RULE6, "you didn't ask": RULE6,
              "just so you know": RULE6, "for what it's worth": RULE6, "fyi": RULE6,
              "heads up": RULE6, "in case you": RULE6,
              "here's what": RULE7, "here is what": RULE7, "let me explain": RULE7,
              "let me walk": RULE7, "to be clear": RULE7, "the short answer": RULE7,
              "the long answer": RULE7, "bottom line": RULE7, "in short": RULE7,
              "to summarize": RULE7, "to sum up": RULE7, "here's the thing": RULE7,
              "here is the thing": RULE7, "the good news": RULE7, "the bad news": RULE7,
              "first off": RULE7, "before i get into": RULE7, "let me start": RULE7}
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
    if cap:
        lines = count_lines(prose)
        if lines > cap:
            fails.append(f"reply is about {lines} lines, over the {cap} line limit (rule 9: "
                         "one screen, the answer and the decisions said properly; he asks "
                         "if he wants more). If he asked you for a piece of work itself, "
                         "that is rule 11 and it is not capped, but an ordinary reply is")
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

# SPEED (owner 08-06, measured not guessed). This subprocess used to inherit the working
# chat's reasoning effort (xhigh) and boot a full Claude Code session first: every tool
# schema, every MCP server, the project settings and hooks. Rendering a reply needs none
# of it. Same prompt, same verdict: 25.5s before, 4.8s after. Never raise the effort here
# to buy quality without timing it first, and never at the cost of the checks below.
LEAN = ["--tools", "", "--strict-mcp-config", "--setting-sources", "",
        "--no-session-persistence", "--disable-slash-commands"]

def run_claude(prompt, model, timeout, effort="medium"):
    env = dict(os.environ, REPLY_LOCK_INNER="1")
    env.pop("CLAUDE_EFFORT", None)
    base = ["claude", "-p", "--output-format", "text", "--model", model]
    eff = ["--effort", os.environ.get("REPLY_LOCK_EFFORT") or effort]
    r = subprocess.run(base + eff + LEAN, input=prompt, capture_output=True,
                       text=True, timeout=timeout, cwd="/tmp", env=env)
    if r.returncode != 0:
        # If a later Claude Code ever drops one of these flags, that must cost us
        # seconds, never the renderer itself: run it the plain slow way and carry on.
        # A hang cannot reach here, a timeout raises and the caller fails open.
        r = subprocess.run(base, input=prompt, capture_output=True, text=True,
                           timeout=timeout, cwd="/tmp", env=env)
    return r

def parse_json(out):
    m = re.search(r"\{.*\}", out or "", flags=re.S)
    return json.loads(m.group(0)) if m else None

def log_error(root, ex):
    with open(os.path.join(state_dir(root), "last-error"), "w") as fh:
        fh.write(str(ex))

T0 = time.time()

def tick(label):
    # REPLY_LOCK_TIMING=1 prints where the seconds actually went. Off by default, so a
    # chat never sees it; it is how the 08-06 speed work was measured instead of guessed.
    if os.environ.get("REPLY_LOCK_TIMING"):
        sys.stderr.write("[%5.1fs] %s\n" % (time.time() - T0, label))

def render(root, owner_msg, draft, notes="", timeout=90, uncapped=False):
    examples = load_examples(root, owner_msg, draft)
    ex_text = ""
    for i, e in enumerate(examples, 1):
        ex_text += f"\n--- EXAMPLE {i} (real, from the owner's chats) ---\n{e}\n"
    # Rule 11 (owner 08-06): he asked to be HANDED the work itself. Telling the writer to
    # cut to fit here would hand him a summary of the thing he asked to see, which is the
    # exact failure the rule exists to stop.
    ceiling = (
        "HE ASKED FOR A PIECE OF WORK ITSELF, NOT A SUMMARY OF IT (rule 11): there is NO "
        "line ceiling on this one and NOTHING he asked for may be dropped, shortened, "
        "sampled, or replaced by a pointer to a file. Keep every item he asked for, in "
        "full. Style still applies to how it reads. "
        if uncapped else
        f"HARD CEILING: the finished reply must fit {CAP} lines of 90 characters. "
        "Count as you write and cut to fit, do not hand back something too long. "
    )
    prompt = (
        "You are the owner's dedicated writer. Below: how the owner communicates, "
        "the lexicon of the system's real names, a few real examples from his "
        "chats, his latest message, and a working agent's complete answer. FIRST "
        "judge it against HIS LATEST MESSAGE: does it answer what he actually "
        "asked? Cut every part that is not the answer, a decision he has to make, "
        "or something he asked about, however true or interesting that part is. "
        "Say each thing ONCE: never restate a fix, a cause, or a result a second "
        "time in different words. Never volunteer what he did not ask about, and "
        "never raise something that needs nothing from him. He asks when he wants "
        "more. If it never answers him, rewrite so the answer comes first. THEN "
        "judge every "
        "sentence: would a person actually text this to a friend? And judge the "
        "shape: when the reply covers 2 or more separate things you MUST give each "
        "one a SHORT bold label alone on its own line with a plain paragraph under "
        "it. " + ceiling +
        "Pass the draft unchanged ONLY if it answers him, reads like one friend "
        "texting another, and already carries those labels. Otherwise rewrite it "
        "fully in the owner's style. CUTTING BEATS KEEPING: dropping a whole topic "
        "he did not ask about, that needs nothing from him, is CORRECT and is not "
        "a loss. But whatever you DO keep must survive exactly: every fact, "
        "number (as digits), name, "
        "date, path, command, "
        "quote, code block, decision, and instruction EXACTLY. Add nothing, soften "
        "nothing, strengthen nothing. \"Drop nothing\" applies INSIDE what you keep, "
        "never against the cut above: if a whole topic fails the FIRST test, delete "
        "it, do not park it under a label like \"Also\" or \"Unrelated\". Never use a "
        "dash inside a sentence. Answer with ONLY this JSON:\n"
        '{"pass": true|false, "rewrite": "full corrected reply, empty when pass"}\n'
        + ("\nFIX ALSO: " + notes + "\n" if notes else "") +
        "\n=== HOW THE OWNER COMMUNICATES ===\n" + STYLE +
        "\n\n=== THE LEXICON ===\n" + lexicon(root) +
        "\n\n=== EXAMPLES ===\n" + (ex_text or "(none stored yet)") +
        "\n\n=== THE OWNER'S LATEST MESSAGE ===\n" + (owner_msg or "(not captured)") +
        "\n\n=== THE WORKING AGENT'S ANSWER ===\n" + draft
    )
    # THE RETRY RUNS AT MEDIUM (owner 08-06, measured, was "high" on the assumption that
    # a retry should think harder). On the two real drafts that actually retry: medium
    # 6.4s / 8.4s / 8.3s / 7.4s, high 41.9s, and the verdicts were IDENTICAL, both drafts,
    # every run. High was buying 35 seconds of nothing on the exact reply he called slow.
    # Never raise it back without timing it on real drafts and showing it changes an
    # outcome, not just the thinking budget.
    r = run_claude(prompt, "claude-sonnet-5", timeout)
    if r.returncode != 0:
        r = run_claude(prompt, "claude-haiku-4-5-20251001", timeout)
    v = parse_json(r.stdout)
    if r.returncode != 0 or v is None:
        raise RuntimeError(f"renderer rc={r.returncode} out={(r.stdout or '')[:200]}")
    if v.get("pass"):
        return draft
    return clean_dashes(str(v.get("rewrite") or "")) or draft

# SPEED, and the one real cause of it (owner 08-06, measured on his own slow reply). The
# first rendering takes about 7 seconds; a RETRY costs 20 to 35 more, and the retry was
# firing on punctuation, not on facts. "6." at the end of a sentence, "19:" in front of a
# test, "08" out of the date 08-06: the number survived the rewrite intact and the check
# still called it dropped, because the trailing mark came along with it. Trailing marks
# are not facts. Stripped here, INSIDE the number only ("6.7", "67%", "1,200") untouched.
TRAIL = ".,:;!?)]}"

def extract_tokens(text):
    body = text
    fences = re.findall(r"```.*?```", body, flags=re.S)
    prose = re.sub(r"```.*?```", "", body, flags=re.S)
    toks = set()
    nums = (n.rstrip(TRAIL) for n in re.findall(r"\d[\d,.:%]*", prose))
    toks.update(n for n in nums if n)                           # numbers as digits
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

def _content(t):
    return set(w.lower() for w in re.findall(r"[a-zA-Z]{4,}",
                                             re.sub(r"```.*?```", "", t, flags=re.S)))

def collapsed(draft, rendered):
    # THE FLOOR (owner 08-06, from a real chat where a whole answer came back as "OK").
    # The writer is allowed to cut a whole topic he did not ask about. It is never
    # allowed to hand back almost nothing: that is the writer failing, not a cut.
    # Mechanical on purpose. The meaning check catches this too, but it is a model call
    # that can be skipped, time out, or error, and it never ran on the retry at all,
    # which is exactly how "OK" reached a chat. This one cannot be skipped.
    d = _content(draft)
    if len(d) < 12:
        return ""                       # too small to judge, the short bypass covers it
    r = _content(rendered)
    if len(r) < 4:
        return f"the rendering is {len(r)} real words long, that is not a reply"
    kept = len(d & r) / len(d)
    if kept < 0.15:
        return f"the rendering kept {int(kept * 100)}% of the answer, that is a collapse"
    return ""

def needs_meaning_check(draft, rendered):
    # The meaning check was running on EVERY reply, including the ones the writer handed
    # back untouched, where it was comparing text to itself for nothing. Skip it ONLY
    # there, where identical text is proof nothing moved. Anything the writer actually
    # rewrote still gets read: guessing at drift from word overlap is not a check.
    return " ".join(draft.split()) != " ".join(rendered.split())

def meaning_check(root, owner_msg, draft, rendered, timeout=60):
    prompt = (
        "Compare ORIGINAL and REWRITE, written to answer the OWNER MESSAGE. Did "
        "the rewrite CHANGE, soften, strengthen, or distort any fact, number, "
        "decision, instruction, or uncertainty that it KEPT? Wording may differ "
        "freely; meaning may not. DROPPING a whole topic the owner did not ask "
        "about, that needs no decision from him, is CORRECT and is never a "
        "problem. Count a removal as a problem ONLY when it drops the answer to "
        "his question, a decision he must make, or a warning he needs. "
        "Answer ONLY JSON: {\"faithful\": true|false, \"problems\": [\"...\"]}\n"
        "\n=== OWNER MESSAGE ===\n" + (owner_msg or "(not captured)") +
        "\n\n=== ORIGINAL ===\n" + draft + "\n\n=== REWRITE ===\n" + rendered
    )
    # Sonnet, not Haiku (owner 08-06, measured on the real prompt): Haiku took 33 to 55
    # seconds against Sonnet's 5, and it failed a rewrite that said the same thing in
    # different words, which cost a whole extra rewrite on top. Faster AND more accurate.
    r = run_claude(prompt, "claude-sonnet-5", timeout)
    v = parse_json(r.stdout)
    if r.returncode != 0 or v is None:
        raise RuntimeError(f"meaning check rc={r.returncode}")
    return bool(v.get("faithful")), [str(p) for p in (v.get("problems") or [])]

# RULE 11 (owner locked it 08-06 alongside raising the cap to 25). "anytime they have to
# give me a work product, like I want them to give me all the tests in the chat versus
# going to a doc, they can do that if I ask them for it. anything that might break this 25
# rule, but it has to be some sort of work product not just a reply."
# Two gates, cheapest first, and it only ever runs on a reply that is ALREADY over the cap:
# a plain phrase match, then one small model call. Both read HIS message, never the draft,
# so a long-winded agent can never talk itself out of the cap.
WP_PHRASES = [
    "in the chat", "versus going to a doc", "instead of a doc", "not in a doc",
    "put it in a doc", "write it out", "write them out", "write out", "list them all",
    "list all", "list every", "list out", "show me all", "show me every",
    "show me the full", "give me all", "give me every", "give me the full",
    "give me the whole", "print them", "print all", "print every", "verbatim",
    "word for word", "exact words", "exact wording", "the full list", "the whole list",
    "every test", "all the tests", "one by one", "in full", "the complete list",
]

def work_product_asked(root, owner_msg, timeout=30):
    msg = (owner_msg or "").lower()
    if not msg.strip():
        return False
    if any(p in msg for p in WP_PHRASES):
        return True
    prompt = (
        "Below is one message from the owner to a working agent. Did he ask the agent to "
        "HAND HIM A PIECE OF WORK in the chat itself, rather than just answer him? A work "
        "product means the thing itself printed out: every test and what each proves, a "
        "full list, a spec, exact wording, a prompt, a set of results, a before and after, "
        "a document he asked to see instead of being pointed at a file. Asking a question "
        "that simply has a lot to say in reply is NOT a work product. Default to false "
        "when it is not clear. Answer ONLY JSON: {\"work_product\": true|false}\n"
        "\n=== THE OWNER'S MESSAGE ===\n" + owner_msg
    )
    try:
        r = run_claude(prompt, "claude-haiku-4-5-20251001", timeout, effort="low")
        v = parse_json(r.stdout)
        return bool(v and v.get("work_product"))
    except Exception as ex:
        # Unavailable means the cap stands. A tight reply is the house default and the
        # agent is told it can say the word if he really did ask for the work itself.
        log_error(root, ex)
        return False

def latest_owner_msg(root):
    # THIS chat's message, not whichever file happens to be newest (owner 08-06). Newest
    # wins meant a second chat, or an agent testing the reply lock, could hand the writer
    # the wrong question to judge the answer against, and the writer's first instruction
    # is to cut everything that does not answer it. Proven reachable by planting a file.
    d = os.path.join(state_dir(root), "prompts")
    sid = os.environ.get("CLAUDE_CODE_SESSION_ID") or ""
    mine = os.path.join(d, sid[:36] + ".txt") if sid else ""
    if mine and os.path.exists(mine):
        try:
            return open(mine).read().strip()
        except Exception:
            return ""
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

    if skips_writer(draft):
        fails = word_scan(draft)
        if fails:
            print("VERDICT: NOT SENDABLE. Broken: " + "; ".join(fails))
            print("Fix the wording and send; short replies need no other check.")
            sys.exit(0)
        record_approval(root, draft)
        print("VERDICT: APPROVED (short reply, no rendering needed). Send it.")
        sys.exit(0)

    owner_msg = latest_owner_msg(root)

    # Rule 11. The work-product question is only ever asked about a draft that is ALREADY
    # over the cap, so the ordinary reply never pays a second for it.
    uncapped = False
    if count_lines(re.sub(r"```.*?```", "", draft, flags=re.S)) > CAP:
        tick("over the cap, asking if he wanted the work itself")
        uncapped = work_product_asked(root, owner_msg)
        tick("work product = %s" % uncapped)
    cap = None if uncapped else CAP

    hard = word_scan(draft, cap=cap)
    toolong = [f for f in hard if "line limit" in f and
               int(re.search(r"about (\d+) lines", f).group(1)) > HARD_STOP]
    if toolong:
        print("VERDICT: NOT SENDABLE, and no rewrite can save it. " + toolong[0])
        print("This costs you a second instead of 30. Cut it to the answer and the "
              "decisions yourself, then run the check once on the shorter draft.")
        sys.exit(0)

    def fail_open(reason):
        # A broken renderer can never mute or hang the chat (owner + both reviews).
        fails = word_scan(draft, cap=cap)
        if fails:
            print("VERDICT: NOT SENDABLE. The renderer is unavailable (" + reason + ") "
                  "and your answer breaks hard rules: " + "; ".join(fails))
            print("Fix those in your own words and run the check once more.")
            sys.exit(0)
        record_approval(root, draft)
        print("VERDICT: APPROVED AS WRITTEN (renderer unavailable: " + reason + "). "
              "Send your answer exactly as drafted.")
        sys.exit(0)

    tick("start render")
    try:
        final = render(root, owner_msg, draft, uncapped=uncapped)
    except Exception as ex:
        log_error(root, ex); fail_open("error")
    tick("render done")
    def hard_faults(rendered):
        # Every mechanical gate, in one place, so the retry is judged exactly as hard
        # as the first pass. Before 08-06 the retry only got two of these and a whole
        # answer could come back as "OK".
        out = []
        if word_scan(rendered, cap=cap):
            out.append("your rewrite broke hard rules: "
                       + "; ".join(word_scan(rendered, cap=cap)))
        misses = mechanical_misses(draft, rendered)
        if misses:
            out.append("you dropped these exact items, keep them verbatim: "
                       + "; ".join(misses[:10]))
        gone = collapsed(draft, rendered)
        if gone:
            out.append("you threw the answer away: " + gone + ". Cutting a topic he did "
                       "not ask about is right; handing back nothing never is")
        return out

    checked_meaning = False

    def read_meaning(rendered):
        # Returns notes. An unavailable meaning check is NOT a pass: say so, so the
        # verdict never claims a check that did not happen.
        nonlocal_notes = []
        if not needs_meaning_check(draft, rendered):
            return nonlocal_notes, True
        try:
            faithful, problems = meaning_check(root, owner_msg, draft, rendered)
        except Exception as ex:
            log_error(root, ex)
            return nonlocal_notes, False
        if not faithful:
            nonlocal_notes.append("meaning drifted: " + "; ".join(problems[:5]))
        return nonlocal_notes, True

    notes = hard_faults(final)
    if not notes:
        mnotes, checked_meaning = read_meaning(final)
        notes += mnotes
    tick("first pass judged (notes=%s)" % notes)
    if notes:
        try:
            # The retry is told exactly what it broke, so it does not need a bigger
            # thinking budget, only room not to time out. A retry that runs out of time
            # throws away the rendering and sends the raw answer.
            final = render(root, owner_msg, draft, notes=" | ".join(notes),
                           timeout=180, uncapped=uncapped)
            # The retry gets every MECHANICAL gate, including the floor, which is what
            # stops a collapse. Tried adding a second meaning pass here on 08-06 and it
            # made 3 of 7 real drafts fall back to the raw answer, so it is out: reading
            # the retry twice cost more good renderings than it caught bad ones.
            if hard_faults(final):
                fail_open("rewrite kept failing the fact checks")
        except Exception as ex:
            log_error(root, ex); fail_open("error on retry")
    tick("done")

    record_approval(root, final)
    if " ".join(final.split()) == " ".join(draft.split()):
        print("VERDICT: APPROVED AS WRITTEN. Send your answer exactly as drafted.")
    else:
        how = ("mechanically and by a meaning pass" if checked_meaning
               else "mechanically (the meaning pass was unavailable, read it closely)")
        print("VERDICT: APPROVED, RENDERED VERSION BELOW. Every fact was checked "
              "against your answer " + how + ". Read it once; "
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
if skips_writer(reply) and not word_scan(reply):
    allow_reset()
if count >= 2:
    # Third failure: let it stand; reasons go to a log, nothing bolted onto his screen.
    with open(os.path.join(state_dir(root), "last-third-strike"), "w") as fh:
        fh.write("stop-time failures exhausted")
    allow_reset()

owner_msg = latest_owner_msg(root)
# Rule 11 here too, or the backup would bounce the very work product the pre-check let
# through. Asked only when the reply is already over the cap.
stop_cap = CAP
if count_lines(re.sub(r"```.*?```", "", reply, flags=re.S)) > CAP and \
        work_product_asked(root, owner_msg):
    stop_cap = None

fails = word_scan(reply, cap=stop_cap)
if not fails:
    try:
        final = render(root, owner_msg, reply, timeout=40, uncapped=stop_cap is None)
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
