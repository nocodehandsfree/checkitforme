# Check - Website — CHECKPOINT (current state)

> **Volatile — update at every "Checkpoint".** Newest on top, bullets, prune finished (history = git).
> Lane: the consumer web app `public/checkit.html` (+ `public/app.html` admin). STAGING-FIRST
> (`staging` → `staging.checkitforme.com`; promote = apply on the `main` prod branch). Clean split with
> the other dev: **he owns the tint CSS** (`__bootTone`/`tone-*`/body wash), **I own view/mode/nav** —
> don't blind-edit the tint, it's fragile.

## ✅ Shipped (07-14 night, batch 5 — PR #16 merged, staging deploy verified)
1. **Radius stops ½/1/2/5/10 mi** (20 gone; default 5). Server /pub/stores/near min-clamp now 0.5.
   Live-verified: staging serves the new ticks; radius 0.5/1/5 at Pacoima → 0/3/69 stores (scales right).
2. **Map reach = Check+ perk:** mapApplyLimits() locks non-any_town accounts inside the radius ring
   (maxBounds + minZoom=ring fit; zoom-IN free). Verified both tiers headless (free bounced to minZoom 11
   bounded; comp roams to 3 unbounded). Leaflet/tiles are CDN — headless verify uses local stubs.
3. **Zone sweep cap 25:** builder refuses a 26th pick, Add-all takes NEAREST 25 (+gray pill, +es);
   server 400s zone_too_big on bigger legacy zones; client maps it to the same pill. One tap ≤25 calls.

## ✅ Shipped (07-14 late, batch 4 — PR #15 merged, staging deploy verified)
Owner-approved share overhaul + chat fixes + fast checks:
1. **Three share surfaces, one approved voice** (en+es, reward stays Admin-dynamic): refer (ONE
   message, replaces 3 divergent strings), check result ("…An AI called the store for me. Check it:"),
   zone results ("Just had an AI call {n} stores at once…"). 7 unfurl cards in public/og/ (refer,
   zone, find×5 brands; brandmark + Inter, 1200×630). /s?k=zone landing carries live counts in og:title.
2. **Splash-proof sharing:** /s joined GATE_SKIP; the coming-soon page carries og tags (refer card on
   ?ref) so previews unfurl even gated. Verified in COMING_SOON=1 mode locally + live tags on staging.
3. **Chat:** launcher flips to a CLOSE tab when chat opens (same thumb spot, lifted above the composer);
   closeSupport pokes iOS to repaint chrome (keyboard blur + same-color root re-assert + 1px scroll).
   iPhone chrome repaint NOT verifiable headless — owner to eyeball.
4. **Deep-linked checks:** html.restoring hides the homepage from the FIRST frame + /pub/result
   prefetch fires during the HTML parse (restoreCall consumes it). 6× CPU throttle: zero homepage
   frames, fetch at +239ms, straight into the result.
FLAG: og:image URLs ride the INTERNAL railway host (c.req header behind the proxy) — pre-existing on
every og tag, previews still load; a public-host constant would be cleaner (DevOps/next pass).
NB (07-14): the session container rolled back once mid-day — pushed work survived on origin; only
uncommitted work needed replaying. Push early, push often.

## ✅ Shipped (07-14, batches 1–3 — PRs #11 #12 #13, all merged + deploy-verified)
My Zones/checks slide-up overhaul against MY_ZONES_COMP + §5.17, the approved 3C/4A My-checks header,
and fixes the owner screenshot-reported. Full detail = the PR bodies + commits; headline list:
zones one-scroller (store cut-off), support bubble hidden in zones/history, comp radius track
(yellow ring), zone dialogs as bottom sheets + Edit stores (+es), 88dvh sheets, 3C/4A header
(watermark corner-pinned after a .wm class collision), root-tint :has() for zones/history/zmenu,
New-zone unsquash (`#zones .zf-scroll>*{flex:0 0 auto}`), Add store copy trim (+es).
Do NOT re-introduce: name-text basket chips, price/check-count in zone flow, green radius selection.
Flags: run-report emoji ✅❌ vs §8 (owner call pending) · qa-design fails on 12 LEGACY tokens (pre-
existing; my comp tokens are allowlisted).

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
