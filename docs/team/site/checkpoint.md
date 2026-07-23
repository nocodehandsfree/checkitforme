# SITE — checkpoint (current state)

> System: the consumer web app `public/checkit.html` + consumer routes in `src/server.ts`,
> design implementation, and ALL copy. Charter + standing rules: `handoff.md` (same folder).
> Volatile — REPLACE stale lines, newest on top, ≤60 lines. History lives in git.

## Verify recipe that works (07-19)
Local server `PORT=88xx tsx src/server.ts` (needs ELEVENLABS_* + ADMIN_TOKEN env) + Playwright via
`playwright-core` + `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (NODE_PATH to node_modules).
tsx has NO hot-reload — restart after edits. Headless→staging TLS is proxy-blocked: drive LOCAL.

## 07-21 — email alerts + zones report head (ALL LIVE ON staging)
- **ONE email-alert path** (`watchStore`): confirmed email → instant ON + toast "Your {store} {Restock
  Alert|Auto Check} is set. Manage in My Checks > Alerts." (shared `alertSetToast`, EN+ES). No email →
  inline ask → ONE confirm; pending → confirm sheet "Check your inbox" (reuses `#watchOverlay`).
  Delivery gated on emailVerifiedAt. `openWatch`/upsell/notify route here.
- **My Checks → Alerts list** (`openAlerts`): each watch = the site store row with the REAL chain logo
  (server `enrichAlertStores`) + On/Off switch (`.ho-toggle`), master "Pause all alerts", trash-removable.
  10-slot cap (on OR off holds one); at cap → make-room.
- **Server half (prod ONLY via promote):** `accounts.alerts_paused_at`; subscribe returns
  on/pending/need_email + cap; `/app/alerts/pause-all`; fan-out skips paused.
  **STATE: promote wanted — the alerts server half + confirm gate.**
- **Zone report head rebuilt** (`renderZoneRun`): KEEP CD's comp RING (removing it was wrong once).
  Head = ring (count "3/5" one line via flex; green CHECK when done) + LEFT-aligned status
  ("Calling stores…"/"Checking live"/"All checked", NEVER the zone name) + "N calling" + `.zrp` pills
  one line. Compared to the owner's 3 comp screenshots and matched. EN+ES.
- Follow-ups: auto-check + waitlist + add-a-store still use their own contact ask (fold into the gate
  later). Feedback POLL still not in the individual-check UNFOLD (`fbk` block).

## OPEN BUG — thin GREEN LINE, /s card bottom edge, iPhone only (UNRESOLVED)
- Never reproduces headless; predates brandmark/border/wash (7 wrong fixes chased those). Prime suspect:
  `.cin{overflow:hidden;border-radius:999px}` clipping the shine's green on iOS.
- NEXT: bisect ON DEVICE, one change at a time (drop `.shine` / drop `.cin` overflow / flat border).
  Do NOT alter the owner-approved design to chase it. Full story in GOTCHAS.

## Lessons that stay true
- iOS: gradients fading to transparent tint green (fade between opaque colors); overflow+radius can leak
  a 1px edge line; Chromium renders CANNOT catch iOS paint — owner's phone is the rig.
- 'in_stock' substring-matches 'not_in_stock' — match negatives first/exact.
- RENDER the comp and read EVERY state before touching a designed head. "Laid out wrong" = fix it, not
  remove it (removed the zone ring once and burned a cycle). The owner's screenshot is truth.

## Open
- Owner's site-fix stream (STATE.md): store-name cutoff on alert cards · alerts sheet formatting · zone
  checks not hitting the activity dashboard · logo fidelity in My Zones + call-log header · copy-doc
  location reconcile. Frozen-site tasks need the owner-named `.unlock` per section.
- Glass sheets rollout (tint discipline) — owner-box only. Restock SMS → A2P (Ops).
