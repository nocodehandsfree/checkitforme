#!/usr/bin/env python3
# Logic for edit-gate.sh (PreToolUse Edit|Write): paths matching .claude/locks are FROZEN
# unless repo-root .unlock (gitignored) contains that EXACT glob. See docs/shared/REBUILD_PLAN.md.
# Second gate (2026-07-29): editing public/app.html requires PROOF OF LOOKING — a fresh
# .claude/state/comp-rendered, written only by an actual comp render (scripts/render-comps.ts).
import sys, json, re, os, time

root = os.path.abspath(sys.argv[1])
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
fp = (data.get("tool_input") or {}).get("file_path") or ""
if not fp:
    sys.exit(0)
p = os.path.abspath(fp if os.path.isabs(fp) else os.path.join(root, fp))
rel = os.path.relpath(p, root).replace(os.sep, "/") if p.startswith(root + os.sep) else p.lstrip("/")

# LOOK BEFORE BUILD (the render gate). Both 07-29 failure classes — invented nav sections,
# a dashboard rebuilt instead of read — started with an agent that never LOOKED at the board.
if rel == "public/app.html":
    sent = os.path.join(root, ".claude", "state", "comp-rendered")
    fresh = os.path.exists(sent) and (time.time() - os.path.getmtime(sent)) < 6 * 3600
    if not fresh:
        sys.stderr.write(
            "LOOK FIRST: no comp render on record for this session (.claude/state/comp-rendered "
            "missing or older than 6h).\n"
            "Before editing the Admin you must SEE the design system and the page you are changing:\n"
            "  ./node_modules/.bin/tsx scripts/render-comps.ts board\n"
            "then OPEN the PNGs in loops/site-redesign/render/ and name the comp element you are\n"
            "copying. The render writes the proof file; then retry this edit. Never touch or fake\n"
            "the proof file by hand — that is working around a gate.\n"
        )
        sys.exit(2)

locks = os.path.join(root, ".claude", "locks")
if not os.path.exists(locks):
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

unlocked = set()
uf = os.path.join(root, ".unlock")
if os.path.exists(uf):
    with open(uf) as fh:
        unlocked = {l.strip() for l in fh if l.strip() and not l.startswith("#")}

with open(locks) as fh:
    for line in fh:
        g = line.strip()
        if not g or g.startswith("#"):
            continue
        if re.match(glob_rx(g), rel) and g not in unlocked:
            sys.stderr.write(
                f"LOCKED: {rel} matches '{g}' in .claude/locks — frozen, not yours to change.\n"
                "This only opens for a task the OWNER named. If you have that task: write the exact\n"
                f"line '{g}' into repo-root .unlock (gitignored), fix ONLY that scope, run\n"
                "bash scripts/verify-live.sh, then DELETE .unlock (re-snapshot the page if consumer UI).\n"
                "No owner-named task? Write 'PM: unlock wanted — <why>' in your checkpoint and STOP.\n"
                "Never work around this gate.\n"
            )
            sys.exit(2)
sys.exit(0)
