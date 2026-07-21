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

## ✅ 07-21 shipped by the prior session (r165-r173, all on staging — detail in git log)
- Zone report transcripts = the REAL status page unfolded in-frame (`zoneExpand` → `deriveVerdict` +
  `combinedTimelineHTML` + `chatBubbles`, same engine as a single check). History unification (calendar
  rows resolve logo/address from live `STORES`; `restoreCall` carries categoryId/zoneRunId). r167 zone
  fixes (edit-zone preselect, share sheet to comp, wide wordmarks in the Calling chip). r168 ghost-tap
  guard v2 (arms on real pointerdown). r171 pin icon. r170 per-step REAL seconds on replayed checks.
- r173 zone REPORT head rebuilt to the owner's comp (screenshots 2 & 3): circular done/total progress
  RING + status-count pills (N in stock / N not / N no answer, from row tones) + `N calling`; replaces
  the 3-segment bar. `renderZoneRun` + poll tick update `#z_ringarc/#z_ringnum/#z_pills/#z_calling`.
  r172 wide wordmark (TJ Maxx) now legible in the `.callwho` Calling chip (white backing, width-driven,
  overflow clips the square canvas's transparent band) — verified with the REAL asset; applies when the
  store's wide/dark flags reach the page (always for NEW checks, not always a reopen from stale cache).
- **OPEN (owner mentioned, deferred — do next if he confirms):** the feedback POLL (In stock / Not in /
  Restocking / Unclear) is NOT yet in the individual-check UNFOLD — the unfold renders verdict+timeline+
  transcript but not the `fbk` block `showResult` adds for unclear results.
- **⚠️ r170's step-ladder code lives in `src/voice/elevenlabs.ts`+`provider.ts` — over the line, left in
  because live+tested; now FROZEN with the engine. Echo's lane reviews/owns it. Website never touches it.**
- **Admin/live-data writes it made (state known, lane now closed to Website):** `user_cancelled` status
  row + admin_hangup note; chain 79 TJ Maxx `logoWide/logoDark=true` on staging.
- Customer stops now read "Check cancelled" (`statusKey user_cancelled`, row status stays admin_hangup,
  no-charge rules unchanged). **Owner supplies rewritten cancel copy (no dashes) — paste verbatim.**

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

## ⏳ Open
- **FIRST BOX (owner 07-21): missing email-confirmation** — box lives in the PM chat; likely cause =
  owner's PROD email never re-set post-promote (admin checkpoint TODO). Owner copy changes = box #2.
- Glass sheets rollout (tint discipline) — owner-box only. Slow result load → Echo. Restock SMS → A2P.
