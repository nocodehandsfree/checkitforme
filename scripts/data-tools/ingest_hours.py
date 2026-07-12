"""Ingest the owner's Google-hours response (pipe format) -> id-keyed hours patch on staging.

Line format (one store):  <id> | <name, city, ST> | Mon <val> | Tue <val> | ... | Sun <val>
  <val> = HH:MM-HH:MM (24h) | closed
A whole-store "unknown" (no day tokens, or a lone 'unknown') -> skipped (leave the store hourless).
Per-day 'unknown' or an INVALID range (close <= open, not a midnight wrap) -> that day left null.
All-null result -> skipped (never deactivate a freshly-added store off a Google miss).

Usage: python3 ingest_hours.py <response.txt> [sent_batch.txt] [--apply]   (DRY default)
  Pass the batch file that was sent to reconcile: every id sent must come back exactly once.
  If any are missing, they're listed and the ingest ABORTS (fix the response first) unless --force.
Token: ADMIN_TOKEN env or .atok. curl subprocess ONLY.
"""
import json, os, re, subprocess, sys, time, tempfile

DRY = "--apply" not in sys.argv
FORCE = "--force" in sys.argv
pos = [a for a in sys.argv[1:] if not a.startswith("--")]
SRC = pos[0]
SENT = pos[1] if len(pos) > 1 else None
BASE = os.environ.get("BASE", "https://staging.checkitforme.com")
TOK = os.environ.get("ADMIN_TOKEN") or open(".atok").read().strip()
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
DABBR = {"mon": "mon", "tue": "tue", "tues": "tue", "wed": "wed", "thu": "thu", "thur": "thu",
         "thurs": "thu", "fri": "fri", "sat": "sat", "sun": "sun"}

def req(method, path, data=None):
    cmd = ["curl", "-s", "--max-time", "180", "-X", method,
           "-H", f"x-admin-token: {TOK}", "-H", f"User-Agent: {UA}"]
    tmp = None
    if data is not None:
        tmp = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False)
        json.dump(data, tmp); tmp.close()
        cmd += ["-H", "content-type: application/json", "--data-binary", "@" + tmp.name]
    cmd.append(BASE + path)
    try:
        for _ in range(4):
            out = subprocess.run(cmd, capture_output=True, text=True).stdout
            try: return json.loads(out)
            except Exception: time.sleep(2)
    finally:
        if tmp: os.unlink(tmp.name)

def canon(v):
    """'HH:MM-HH:MM'/'closed' -> [o,c] | None(closed) | 'bad'(invalid range) | '?'(unknown)."""
    v = v.strip().lower()
    if v in ("closed",): return None
    if v in ("unknown", "", "n/a", "na"): return "?"
    m = re.match(r"(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})", v)
    if not m: return "?"
    o = f"{int(m.group(1)):02d}:{m.group(2)}"; c = f"{int(m.group(3)):02d}:{m.group(4)}"
    if c == "24:00": c = "00:00"
    # valid if close > open, OR close is midnight (00:00 = wraps to next day)
    if c == "00:00" or c > o: return [o, c]
    return "bad"

stats = {"lines": 0, "skip_unknown": 0, "written": 0, "bad_days": 0, "all_null_skip": 0}
updates = {}  # id -> hours json string
for line in open(SRC):
    line = line.strip()
    if not line or "|" not in line: continue
    parts = [p.strip() for p in line.split("|")]
    if not parts[0].isdigit(): continue
    stats["lines"] += 1
    rid = int(parts[0])
    daytokens = parts[2:]  # parts[1] is the name/city/st echo
    if not daytokens or (len(daytokens) == 1 and daytokens[0].strip().lower() == "unknown"):
        stats["skip_unknown"] += 1; continue
    hrs = {d: None for d in DAYS}; anyknown = False
    for tok in daytokens:
        m = re.match(r"([A-Za-z]{3,5})\s+(.+)", tok.strip())
        if not m: continue
        d = DABBR.get(m.group(1).lower())
        if not d: continue
        val = canon(m.group(2))
        if val == "bad": stats["bad_days"] += 1; hrs[d] = None; continue
        if val == "?": hrs[d] = None; continue
        if val is None: hrs[d] = None; continue
        hrs[d] = val; anyknown = True
    if not anyknown:
        stats["all_null_skip"] += 1; continue
    updates[rid] = json.dumps(hrs, separators=(",", ":"))
    stats["written"] += 1

print(f"{'DRY' if DRY else 'APPLY'} — {SRC}")
print(f"lines:{stats['lines']} write-hours:{stats['written']} skip-unknown:{stats['skip_unknown']} "
      f"all-null-skip:{stats['all_null_skip']} invalid-days-nulled:{stats['bad_days']}")

# reconcile against the exact ids we sent — nothing dropped, nothing invented
if SENT:
    sent_ids = [m.group(1) for line in open(SENT) if (m := re.match(r"\s*(\d+)\s*\|", line))]
    got_ids = [str(x) for line in open(SRC) if (m := re.match(r"\s*(\d+)\s*\|", line)) for x in [m.group(1)]]
    sset, gset = set(sent_ids), set(got_ids)
    missing = [i for i in sent_ids if i not in gset]
    extra = [i for i in got_ids if i not in sset]
    dup = sorted({i for i in gset if got_ids.count(i) > 1})
    print(f"RECONCILE — sent:{len(sent_ids)} returned:{len(got_ids)} "
          f"missing:{len(missing)} extra:{len(extra)} duplicated:{len(dup)}")
    if missing: print("  MISSING ids (re-request these):", ",".join(missing))
    if extra:   print("  EXTRA ids (returned but not sent):", ",".join(extra))
    if dup:     print("  DUPLICATED ids:", ",".join(dup))
    if (missing or extra or dup) and not FORCE and not DRY:
        sys.exit("ABORT — reconciliation failed; fix the response or pass --force")
if DRY:
    for rid in list(updates)[:3]: print("  ", rid, "->", updates[rid])
    sys.exit(0)

# group by identical hours to cut calls
groups = {}
for rid, hj in updates.items(): groups.setdefault(hj, []).append(rid)
ts = int(time.time()); patched = 0
for hj, ids in groups.items():
    for i in range(0, len(ids), 400):
        req("POST", "/api/stores/patch", {"where": {"ids": ids[i:i + 400]}, "set": {"hours": hj, "hoursUpdatedAt": ts}})
        patched += len(ids[i:i + 400])
print("patched hours on", patched, "stores")
