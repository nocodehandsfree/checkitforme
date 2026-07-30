#!/usr/bin/env python3
# Logic for nav-gate.sh (PostToolUse Edit|Write on public/app.html): the Admin's map of
# surfaces is FROZEN (CLAUDE.md LAW 4). Any nav group, tab, or <section id> not listed in
# .claude/nav-allowlist blocks the session until the agent reverts it. Born 2026-07-29 after
# an agent invented new Policy nav sections the owner never named.
import sys, json, re, os

root = os.path.abspath(sys.argv[1])
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
fp = ((data.get("tool_input") or {}).get("file_path") or "").replace("\\", "/")
if not fp.endswith("public/app.html"):
    sys.exit(0)

app = os.path.join(root, "public", "app.html")
allow_f = os.path.join(root, ".claude", "nav-allowlist")
if not (os.path.exists(app) and os.path.exists(allow_f)):
    sys.exit(0)

allowed = set()
with open(allow_f) as fh:
    for line in fh:
        line = line.strip()
        if line and not line.startswith("#"):
            allowed.add(line)

html = open(app, encoding="utf-8").read()
found = {f"section:{s}" for s in re.findall(r'<section id="([a-z_]+)"', html)}
m = re.search(r"const NAV_GROUPS=\{(.*?)\n\};", html, re.S)
if m:
    block = m.group(1)
    found |= {f"group:{g}" for g in re.findall(r"^\s*([a-z]+):\s*\{label:", block, re.M)}
    found |= {f"tab:{t}" for t in re.findall(r"\['([a-z_]+)','", block)}

rogue = sorted(found - allowed)
if rogue:
    sys.stderr.write(
        "NAV GATE — the Admin's map of surfaces is FROZEN (LAW 4) and your edit grew it:\n"
        + "".join(f"  new {r}\n" for r in rogue)
        + "A new page, tab, or nav group exists ONLY when the OWNER names it first. He has not.\n"
        "REVERT the addition now (put the content on an existing page instead — pick its page\n"
        "type per the build-on-brand skill). If the owner really named this surface, add its\n"
        "line to .claude/nav-allowlist in the SAME commit and say so in your reply.\n"
    )
    sys.exit(2)
sys.exit(0)
