#!/usr/bin/env python3
# Logic for copy-gate.sh (PostToolUse Edit|Write on user-facing files): no em/en dash, no
# hyphen-as-punctuation, plus the banned terminology (seeded from the retired Lexicon/Copper
# lanes, 2026-07-22 rebuild). Checks ONLY the content the agent just wrote.
# Authority: docs/design/copy/COPY_STYLE_GUIDE.md.
import sys, json, re

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
ti = data.get("tool_input") or {}
fp = (ti.get("file_path") or "").replace("\\", "/")

DASH_SCOPE = re.compile(r"(public/[^/]+\.html$|docs/design/emails/)")
TERM_SCOPE = re.compile(r"(public/checkit\.html$|docs/design/emails/)")  # consumer copy only
if not DASH_SCOPE.search(fp):
    sys.exit(0)

chunks = []
if isinstance(ti.get("content"), str): chunks.append(ti["content"])
if isinstance(ti.get("new_string"), str): chunks.append(ti["new_string"])
for e in ti.get("edits") or []:
    if isinstance(e, dict) and isinstance(e.get("new_string"), str):
        chunks.append(e["new_string"])
new = "\n".join(chunks)
if not new:
    sys.exit(0)

problems = []

# 1) em/en dashes — never allowed in user-facing files, anywhere.
for i, line in enumerate(new.split("\n"), 1):
    if "—" in line or "–" in line:
        problems.append(f"  dash line {i}: {line.strip()[:120]}")

# 2) hyphen-as-punctuation + banned terms — checked inside COPY only (quoted strings + HTML
#    text), so code arithmetic like `total - count` never trips it.
def copy_spans(text):
    spans = re.findall(r"'([^'\n]*)'|\"([^\"\n]*)\"|`([^`]*)`", text)
    out = [s for tup in spans for s in tup if s]
    out += [t for t in re.findall(r">([^<>{}\n]+)<", text) if t.strip()]
    return out

TERMS = [
    (re.compile(r"\bFungie\b"), 'say "Check AI", never Fungie'),
    (re.compile(r"Powered by Fungibles", re.I), "the footer credit is NOTHING"),
    (re.compile(r"\bclerk\b", re.I), 'the person at the store is "Staff"'),
    (re.compile(r"\bscheduled checks?\b", re.I), 'it is "auto checks"'),
    (re.compile(r"\bspam\b", re.I), 'never say "spam"'),
    (re.compile(r"\b(leverage|seamless|empower|streamline|utilize|robust)\b", re.I), "banned corporate filler"),
    (re.compile(r"\b(IVR|DTMF|E\.164|COGS|MRR)\b"), "jargon needs a plain gloss in consumer copy"),
]
check_terms = bool(TERM_SCOPE.search(fp))
for span in copy_spans(new):
    if re.search(r"[A-Za-zÀ-ÿ] - [A-Za-zÀ-ÿ]", span) or " -- " in span:
        problems.append(f"  hyphen-as-punctuation: {span.strip()[:120]}")
    if check_terms:
        for rx, why in TERMS:
            if rx.search(span):
                problems.append(f"  term ({why}): {span.strip()[:120]}")

if problems:
    sys.stderr.write("COPY GATE — fix before you move on (docs/design/copy/COPY_STYLE_GUIDE.md):\n")
    seen = set()
    for p in problems[:20]:
        if p not in seen:
            sys.stderr.write(p + "\n"); seen.add(p)
    sys.stderr.write("Style guide: no dashes. Split into sentences.\n")
    sys.stderr.write("Rewrite the lines above in place NOW (and their Spanish twins, same commit).\n")
    sys.exit(2)
sys.exit(0)
