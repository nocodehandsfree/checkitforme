# Check - Website — CHECKPOINT (current state)

> **Volatile — update at every "Checkpoint".** Newest on top, bullets, prune finished (history = git commits).
> Lane: the consumer web app `public/checkit.html` (+ `public/app.html` admin). STAGING-FIRST:
> branch `claude/checkitforme-website-takeover-pagiis` → `staging.checkitforme.com`. Prod = branch
> `claude/retail-stock-voice-calls-OcyMS` (`checkitforme.com`); promote = apply the change on the prod branch.
> Clean split with the other dev: **he owns the tint CSS** (`__bootTone`/`tone-*`/the body wash), **I own
> view/mode/nav**. Don't blind-edit the tint — it's fragile.

## ▶ Doing now — owner UI-polish pass on staging (screenshot-driven)
Rapid back-and-forth: owner screenshots staging, I fix, push, he re-verifies. All staging until he confirms,
then I port to prod. Keep replies outcome-first.

## ✅ Just shipped to STAGING (07-09, awaiting owner verify → then promote to prod)
- **Unmapped-store "coming soon"** (`callReady:false`): greyed row + "Coming soon" chip; tap → toast
  "Adding store soon!"; hard-blocked from dialing via a guard in `pickStore` (covers map path too).
- **Call sheet copy:** hobby-locked = "We'll check on pricing and availability for {set} {product}";
  removed "· costs 1 check" (only button that had it) + the green "Pick the exact set or product" link.
- **Open-first store sort** in hobby/thrift (modes that show closed stores): known-open float to top, then
  nearest. Retail unchanged (it hides closed).
- **Closed-store tap toast:** neutral (not green) + "The store is closed." (dropped "No charge" — nothing
  was attempted).
- **Map "Pinch to zoom, tap to drop a pin" pill:** neutral dark (was green) + forced one line (`.oneline`
  nowrap; v2 toast style allows wrapping otherwise).
- **Grey footer line KILLED:** was `html[data-skin=v2] body::after` — a fixed 2px `#1D1D22` bar pinned to
  the viewport bottom (a dead iOS-toolbar-pin hack that showed as a line on tinted pages). Removed. Footer
  bg also set transparent. ⚠️ if the iOS bottom toolbar ever tints on a colored result page, that's the
  tint-dev's edge-pinning, not this bar.
- **"Loading your check" screen:** bigger (24px/800 Inter) + animated 3-dot loader **inline-styled** (was a
  white block because `.loaddots` class didn't apply at the early deep-link paint). Font already preloaded.

## ✅ Shipped 07-08 (staging + PROD)
- Reload/hobby-bleed fix: killed the `cifm_mode=hobby` auto-restore (Retail is home base every reload) +
  gated `body.huntmode #hobby{display:block}` with `:not(.hidden)` so history/calendar/result can hide it.
- Hobby product icons accent-tinted (yellow) via `hobbyIcon()`.
- Footer © = **one centered line** "© <year> High Science LLC" (`#footYear` dynamic).

## ⏳ OPEN — needs owner / other lanes
- **Promote the 07-09 staging batch to prod** once owner signs off (apply on `...OcyMS` branch, isolated).
- **B&N auto-check "can't cancel":** cancel UI exists at **My checks → Overview → "Your auto-checks"**
  (`renderAcctScheds`, red Cancel → `cancelSchedule` → DELETE `/app/schedules/:id`). Couldn't repro without
  owner's account — asked WHERE he's trying (calendar? banner?). If it's not listed there, real bug to chase.
- **❗Email template renders as PLAIN TEXT in owner's inbox — UNRESOLVED.** Design's template never showed;
  even the "send test" lands as plain text. Reproduce what HE receives (Outlook mobile), confirm
  `renderBrandedEmail` is on the test path, check Brevo image hosting, consider a real Brevo-hosted
  `brevoTemplateId`. (Email must be TABLE HTML + inline styles — flexbox/grid never render in mail.)
- **Service worker PHASE 2 (NOT DONE):** currently retired (`sw.js` self-destruct stub + unregister on load).
  Owner wants it back as network-first-HTML (fresh online + offline fallback + instant takeover). Don't
  reintroduce the old 1.2s stale-serve race.
- **Prod launch flags (NOT DONE):** set `flags.hobby=false` + `flags.thrift=false` on prod so only
  Retail+Kiosk are live at launch; flip on later.
- **Restock SMS — blocked externally:** Twilio A2P 10DLC denied; toll-free not approved. Email alerts (Brevo)
  are live and need no A2P. Re-ask owner: temporarily route restock as email, or pursue toll-free?
- **DevOps still owes Zones endpoints** (`/app/zones/*` per `docs/archive/manage-zones-SHIPPED.md`); consumer
  UI already calls them. Also: `/p/privacy` pulls a 404 resource; prod June-calls calendar nav (check after promote).

## 🪤 Traps (don't rediscover)
- **Brevo env var = `BREVO_API_KEY`** (not BRAVO/ESP). `espEmail` gates on `config.alerts.brevoApiKey`.
- **v2 toast wraps** (`white-space:normal`); use `.oneline` for single-line hints. Default toast is GREEN —
  pass `'neutral'` for status/errors.
- **`.loaddots` / class-based CSS can miss the early deep-link boot paint** — inline-style anything rendered
  in the `sp.get('call')` boot block.
- **Connect-on-human VAD:** direct-dial chains must carry `avgTreeSeconds=null`; VAD gate ~22 frames on
  direct dials (fix in `src/voice/bridge.ts`). "hi Bob" staff-name = in the WORKFLOW, not code.
- **Skin toggle is DEAD** — `data-skin=v2` unconditional; the redesign is THE render. No preview gate.
- Backgrounded `npx tsx` gets SIGTERM (exit 144); run `run_in_background:true`, kill in a separate command.

> Migration note: repo moving to `nocodehandsfree/checkitforme` (branches staging + main). Only what's
> committed survives — chat memory does not.
