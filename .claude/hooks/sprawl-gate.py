#!/usr/bin/env python3
# Logic for sprawl-gate.sh (PreToolUse Write): a NEW file may only be created inside
# .claude/allowed-paths. Existing files and paths outside the repo are untouched.
# LAW 11 (no sprawl, no new folders) as a machine gate — REBUILD_PLAN, 2026-07-22.
import sys, json, re, os

root = os.path.abspath(sys.argv[1])
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
fp = (data.get("tool_input") or {}).get("file_path") or ""
if not fp:
    sys.exit(0)
p = os.path.abspath(fp if os.path.isabs(fp) else os.path.join(root, fp))
if not p.startswith(root + os.sep):
    sys.exit(0)  # outside the repo (scratchpad etc.) — not our problem
if os.path.exists(p):
    sys.exit(0)  # editing an existing file is fine
rel = os.path.relpath(p, root).replace(os.sep, "/")

allowed = os.path.join(root, ".claude", "allowed-paths")
if not os.path.exists(allowed):
    sys.exit(0)

def glob_rx(g):
    out, i = "", 0
    while i < len(g):
        if g[i : i + 2] == "**":
            out += ".*"; i += 2
        elif g[i] == "*":
            out += "[^/]*"; i += 1
        elif g[i] == "?":
            out += "[^/]"; i += 1
        else:
            out += re.escape(g[i]); i += 1
    return "^" + out + "$"

with open(allowed) as fh:
    for line in fh:
        g = line.strip()
        if not g or g.startswith("#"):
            continue
        if re.match(glob_rx(g), rel):
            sys.exit(0)

sys.stderr.write(
    f"SPRAWL GATE: {rel} is a NEW file outside the allowed paths (.claude/allowed-paths).\n"
    f"New files need sign-off — write 'PM: {rel} — <why>' in your checkpoint and put the\n"
    "content where it belongs instead: docs/team/<you>/ or docs/specs/<feature>/ for docs,\n"
    "docs/tasks/ for queue items. Never invent a new folder or root file.\n"
)
sys.exit(2)
