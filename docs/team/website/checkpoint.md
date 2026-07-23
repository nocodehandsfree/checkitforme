# Check - Website — CHECKPOINT (current state)

> **Volatile — update at every "Checkpoint".** Newest on top, bullets, prune finished (history = git).

## ⚖️ STANDING ORDERS (permanent — obey on every task, they survive every session)
1. **Lane:** consumer web app `public/checkit.html` + consumer routes in `src/server.ts`. The CALLING
   ENGINE (`src/voice/`) is FROZEN — the machine blocks edits (owner order after this lane's
   predecessor flip-flopped a one-line engine fix and bypassed the proven dial path). If a task seems
   to need an engine change, write `PM: engine change wanted — <why>` here and STOP. Store settings
   (mute/method/recipes/logo flags) are also out of bounds — data lane only.
2. **ADDITIVE (CLAUDE.md LAW 1):** new work snaps onto existing pieces — name them BEFORE building:
   store row (`.store`/`.ic`/storeFace) · logo system (storeFace + `.slogo.emboss`; read
   `docs/data/store-logos.md` first) · sheets (openSheet physics; sheetHObserver bottom-anchors EVERY
   `.overlay` — never fight it with position:fixed) · view/mode nav incl. the shared BACK behavior
   (every new screen wires into it) · toast = ONE gray line, EN+ES · i18n `t()`/`tf()`, Spanish in the
   SAME commit · live-call view (steps 1-8 + `/listen` audio) is display-only here — feed is engine-side.
3. **Design + copy:** open `docs/design/STYLE_GUIDE.md` + `docs/design/copy/COPY_STYLE_GUIDE.md` first;
   build 1:1 to `docs/design/comps/WEBSITE_COMPS.dc.html`. A `.dc.html` comp is RENDERED, never
   grepped — no comp = assemble from live site elements, never invent. Never re-introduce a reverted
   design. Status/system copy comes from the owner/Copy lane — don't author it.
4. **Done = the ship-it skill:** tsc + tests for what you changed + DRIVE it (local server + Playwright
   recipe below) + push same turn + Done Report (Built / Drove it / Left). iOS paint is the owner's
   phone only: ship ONE change, "pushed, check your phone," never "fixed."
5. Never run the full suite unprompted, never in background. Never wait on a promote — leave
   `PM: promote wanted — <what>` here and move on. Don't self-start ideas the owner said to hold.

## 🔧 Verify recipe that works (07-19)
Local server `PORT=88xx tsx src/server.ts` (needs ELEVENLABS_* + ADMIN_TOKEN env) + Playwright via
`playwright-core` + `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (NODE_PATH to node_modules).
tsx has NO hot-reload — restart after edits. headless→staging TLS is proxy-blocked: drive LOCAL.

## 🧰 07-23 (Webbie) — 5 queued tasks SHIPPED: PR #92 merged to staging @4f6c4a6 + Admin (ship-admin)
- Admin policy flags added (`src/policy.ts` + FLAG_GROUPS in `app.html`, nothing else in Admin): `inStockBanner`
  gates the `#finds` banner; `productPokemon/OnePiece/Topps/Needoh` filter `brandSwitcher()` (server injects via
  `cachedPolicy()`), and client `buildSwitcher` hides `#vsw` when ≤1 product (Pokémon-only = no dropdown). Defaults ON.
- Back: `openAlerts` → `sheetPush('alerts')` + `['alertsOv',closeAlerts]` in popstate (email/score sheets share the
  gap, left for a named follow-up). Zones→Activity: `zonePollTick` now `ensureHistCache()` per finished store.
- Alerts rows: `.alrow` stacked layout, name full-width 2-line wrap, On/Off + trash drop below so long names show.
- verify-live: staging LIVE @4f6c4a6 (markers in truth snapshot); Admin override live @4f6c4a6; truth re-snapshotted.
  Owner confirms on phone: banner OFF state, alerts row long name, back-collapse, a live zone run. NOT promoted to prod.

## ✅ 07-21 (Webbie) — email alerts + zones report head (ALL LIVE ON staging)
- **ONE email-alert path** (`watchStore`): confirmed email → instant ON + toast "Your {store} {Restock
  Alert|Auto Check} is set. Manage in My Checks > Alerts." (shared `alertSetToast`, EN+ES). No email →
  inline ask → ONE confirm; pending → confirm sheet top "Check your inbox" (reuses `#watchOverlay`).
  Delivery gated on emailVerifiedAt so a pending watch turns on itself. `openWatch`/upsell/notify route here.
- **My Checks → Alerts list** (`openAlerts`): each watch = the site store row with the REAL chain logo
  (server `enrichAlertStores`, same `chainLogoInfo`+type as the homepage) + On/Off switch (`.ho-toggle`),
  master "Pause all alerts" on top, trash-removable. 10-slot cap (on OR off holds one); at cap → make-room.
- **Server** (`src/`, prod ONLY via promote): `accounts.alerts_paused_at` (bootstrap ALTER); subscribe
  returns on/pending/need_email + cap; `/app/alerts/pause-all`; myAlerts adds location/logo/paused/slots;
  fan-out skips paused. **PM: promote wanted — the whole alerts server half + confirm gate.**
- **Zone report head rebuilt** (`renderZoneRun`; owner rejected it hard): KEEP CD's comp RING (I removed
  it once — wrong, never do that). Head = ring (count "3/5" side-by-side ONE line via flex; green CHECK
  when done) + LEFT-aligned status "Calling stores…"/"Checking live"/"All checked" (NEVER the zone name) +
  "N calling" + `.zrp` count pills on ONE line, no stray live dot. Nothing else on the page touched. EN+ES.
- **Drove it all** local server + Playwright, both langs, no JS errors; zone head compared to the owner's
  3 comp screenshots (done/live/starting) and matched.
- **Follow-ups:** auto-check + launch-waitlist + add-a-store still use their own contact ask (fold into the
  gate later). Feedback POLL still not in the individual-check UNFOLD (`fbk` block from `showResult`).

## 🚨 OPEN BUG — thin GREEN LINE, /s card bottom edge, iPhone only (UNRESOLVED)
- Never reproduces headless; predates brandmark/border/wash (7 wrong fixes chased those). Prime suspect:
  `.cin{overflow:hidden;border-radius:999px}` clipping the shine's green on iOS.
- NEXT: bisect ON DEVICE, one change at a time — drop `.shine` / drop `.cin` overflow / flat border.
  Do NOT alter the owner-approved design to chase it. Full story in GOTCHAS.

## ⚠️ Lessons that stay true
- iOS: gradients fading to transparent tint green (fade between opaque colors); overflow+radius can leak
  a 1px edge line; Chromium renders CANNOT catch iOS paint — owner's phone is the rig.
- 'in_stock' substring-matches 'not_in_stock' — match negatives first/exact. A "not in stock" share
  landing has no use case. `#auth_logo` is a left-flex wordmark bar (override per mode).
- **RENDER the comp and read EVERY state before touching a designed head.** "circle laid out wrong" = fix
  the circle, NOT remove it. I removed the zone ring and burned a cycle. The owner's screenshot is truth.

## ⏳ Open
- **FIRST BOX (owner 07-21): missing email-confirmation** — box lives in the PM chat; likely cause =
  owner's PROD email never re-set post-promote (admin checkpoint TODO). Owner copy changes = box #2.
- Glass sheets rollout (tint discipline) — owner-box only. Slow result load → Echo. Restock SMS → A2P.
