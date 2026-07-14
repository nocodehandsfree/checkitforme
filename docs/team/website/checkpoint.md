# Check - Website — CHECKPOINT (current state)

> **Volatile — update at every "Checkpoint".** Newest on top, bullets, prune finished (history = git).
> Lane: the consumer web app `public/checkit.html` (+ `public/app.html` admin). STAGING-FIRST
> (`staging` → `staging.checkitforme.com`; promote = apply on the `main` prod branch). Clean split with
> the other dev: **he owns the tint CSS** (`__bootTone`/`tone-*`/body wash), **I own view/mode/nav** —
> don't blind-edit the tint, it's fragile.

## ✅ Just shipped (07-13)
- **PROD is coming-soon (LIVE).** `COMING_SOON=1` on the PROD Railway svc → `renderComingSoon` splash
  (Check wordmark + "Find insanely hard to get products on the shelves at retail prices." + 4 product
  icons + "COMING SOON" pinned at the bottom) replaces ALL public HTML (renderRunner + renderShare).
  Admin/API/assets untouched. **To re-open the site: set `COMING_SOON=0` on prod svc `d363a982…`.**
  Code = `config.comingSoon` + `renderComingSoon()` in src/server.ts. Copy: fixed "shelfs"→"shelves",
  cap "Find". English only — Spanish still pending owner call.
- **Check history + My Zones = real `.overlay/.modal` bottom sheets** — the SAME recipe as Add store /
  My checks (owner rejected full-page views AND a CSS-hack sheet before this). `#zones` + `#histOverlay`
  are `.overlay`; content renders into `#zmodal` / `#histmodal` (persistent modal so sheetUpV2 doesn't
  replay on internal nav). In the v2 sheet CSS group (flex-end, 88vh fixed, rounded top, drag handle,
  sheetUpV2). `sheetDrag()` drags them down; backdrop tap / browser-back close them; return to My checks
  via acctReturn/openAccount. Zones renders retarget `#zmodal`; `zHideAll` no longer hides bg views (so
  the site shows dimmed behind, like Add store). Header is clean/transparent — no gray gradient bar, no
  credits pill (read as a duplicate My checks header), no top-level back button. Verified logged-in on
  staging (geometry top≈101/88vh, no JS errors, build-view list scrolls + basket visible).
- **OPEN owner questions:** (1) build/report sub-screen still has a small ‹ back-to-list button — keep or
  kill? (2) the **new My checks header** Design comp (5ee11aa) is NOT built into the live site yet — build it?

## ⏳ OPEN — needs owner / other lanes
- **Promote the 07-09→07-11 staging batch to prod** once owner signs off (staging carries many lanes'
  work — DevOps takes it all unless it's split).
- **B&N auto-check "can't cancel":** the cancel UI IS at **My checks → Overview → "Your auto-checks"**
  (`renderAcctScheds` → red Cancel → DELETE `/app/schedules/:id`). Couldn't repro without the owner's
  account — asked WHERE he's trying (calendar? banner?). If it's not listed there, real bug to chase.
- **❗Email template renders as PLAIN TEXT in the owner's inbox — UNRESOLVED.** Even "send test" lands
  plain. Reproduce what HE receives (Outlook mobile), confirm `renderBrandedEmail` is on the test path,
  check Brevo image hosting / a real `brevoTemplateId`. (Mail = TABLE HTML + inline styles only.)
- **Service worker PHASE 2 (NOT DONE):** currently a self-destruct tombstone. Owner wants it back as
  network-first-HTML (fresh online + offline fallback + instant takeover). Don't reintroduce the old
  ~1.2s stale-serve race.
- **Prod launch flags (NOT DONE):** set `flags.hobby=false` + `flags.thrift=false` on prod so only
  Retail + Kiosk are live at launch; flip on later.
- **Restock SMS blocked externally:** Twilio A2P 10DLC denied, toll-free not approved. Email alerts
  (Brevo) are live and need no A2P. Re-ask owner: route restock as email, or pursue toll-free?
- **DevOps still owes Zones endpoints** (`/app/zones/*` per `docs/archive/manage-zones-SHIPPED.md`;
  consumer UI already calls them). Also `/p/privacy` pulls a 404 resource; check prod June-calls
  calendar nav after promote.

## 🪤 Traps
Moved to the **`known-problems`** skill (`.claude/skills/known-problems/`) — v2 toast defaults
green/wraps (pass `'neutral'`, use `.oneline`), `.loaddots`/class CSS misses the deep-link boot paint
(inline-style boot-block renders), direct-dial chains need `avgTreeSeconds=null`, backgrounded
`npx tsx` gets SIGTERM, Brevo env is `BREVO_API_KEY`, and the `?skin=v2` gate is DEAD (v2 is the
unconditional render). Full detail there + `docs/shared/GOTCHAS.md`.
