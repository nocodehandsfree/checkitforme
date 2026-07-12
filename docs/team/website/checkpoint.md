# Check - Website — CHECKPOINT (current state)

> **Volatile — update at every "Checkpoint".** Newest on top, bullets, prune finished (history = git).
> Lane: the consumer web app `public/checkit.html` (+ `public/app.html` admin). STAGING-FIRST
> (`staging` → `staging.checkitforme.com`; promote = apply on the `main` prod branch). Clean split with
> the other dev: **he owns the tint CSS** (`__bootTone`/`tone-*`/body wash), **I own view/mode/nav** —
> don't blind-edit the tint, it's fragile.

## ✅ Just shipped (07-12)
- **PROD is coming-soon.** `COMING_SOON=1` env (prod svc) → `renderComingSoon` splash (Check wordmark +
  "Find insanely hard to get products on the shelves at retail prices." + 4 product icons) replaces ALL
  public HTML (renderRunner + renderShare). Admin/API/assets untouched. Flip `COMING_SOON=0` on prod to
  re-open. Verified live: apex+brands gated, caller.* admin still loads. Copy tweak: "shelfs"→"shelves",
  capitalized "Find" (flagged to owner). English only — Spanish pending owner call.
- **Check history + My Zones = real bottom slide-ups** (owner rejected the full-page-view version twice).
  `#zones` fixed z4300 translateY(100→0) via `.up`; history via `body.histsheet #result` + `.hup`. Slide
  UP over My checks, slide DOWN returns to My checks (openAccount under). zShow/backFromZones/openHistory/
  closeHistory wired; `#zmenuOv` bumped z4600. Verified logged-in on staging (mid-frames caught sliding).

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
