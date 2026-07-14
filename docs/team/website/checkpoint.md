# Check - Website — CHECKPOINT (current state)

> **Volatile — update at every "Checkpoint".** Newest on top, bullets, prune finished (history = git).
> Lane: the consumer web app `public/checkit.html` (+ `public/app.html` admin). STAGING-FIRST
> (`staging` → `staging.checkitforme.com`; promote = apply on the `main` prod branch). Clean split with
> the other dev: **he owns the tint CSS** (`__bootTone`/`tone-*`/body wash), **I own view/mode/nav** —
> don't blind-edit the tint, it's fragile.

## ✅ Shipped (07-14 pm, batch 2 — PR #12 merged to staging, deploy verified)
1. **My checks header = approved 3C/4A comp** (docs/specs/mychecks-header): muted green wash, watermark
   check top-right, MY CHECKS eyebrow, phone 26/900 + email under, Sign out now a grey underlined link
   at the FOOT below RUN A CHECK (free + member overviews), plan pill gone → plan reads under Manage
   plan ('Unlimited · billed monthly', +es). Sheet+grabber = #1D1D22. qa-design allowlist +5 comp tokens.
2. **"Solid top/bottom" while sheets open:** zones/history/zone-dialog sheets were missing from the
   root-tint `:has()` rules (root stayed #1D1D22 while the page dimmed → slabs behind iOS chrome). Now
   in the same rule as acct/buy/page. NB the bare-page root #1D1D22 is CORRECT (v2 --bg) — do NOT set
   #0C0C12 there; the design-lane "root stays #0C0C12" note refers to the sheet-open/dim state.
   NOT verified on a real iPhone (headless can't show iOS chrome) — owner to eyeball.
3. **New-zone button crushed to a sliver** with 2+ zone cards: `.zf-scroll` flex-column children were
   shrinking → `#zones .zf-scroll>*{flex:0 0 auto}`. Verified locally with the owner's exact 2-zone
   scenario (56px again); staging zones list needs a Check+ account so re-check there is owner's tap.
4. **Add store:** dropped 'Tell us which store to add.' — line now leads with the free-check incentive
   (en+es). Verified live on staging.

## ✅ Shipped (07-14 am, batch 1 — PR #11) — My Zones: comp-vs-page list, all fixed + verified headless (390×844 iPhone)
Method: comp screenshotted (MY_ZONES_COMP.dc.html) → measured page → fixed the diff list one at a time,
re-screenshotting each. Staging site is splash-gated (blocker below) so verification ran on a LOCAL
server at the same commit + stubbed store data; geometry + screenshots per fix.
1. **Store cut off (owner screenshot) FIXED:** `.zlist` kept its own `overflow-y:auto` scroll window from
   the old layout; the basket pad on `.zf-scroll` squeezed it to ~251px and rows CHOPPED at its edge while
   `.zf-scroll` itself never scrolled (sh==ch). Now ONE scroller (`#zones .zf-scroll .zlist{max-height:
   none;overflow-y:visible}`) — verified: last row scrolls fully clear of the basket (row b=594 < basket
   t=612).
2. **Support bubble over SAVE ZONE FIXED:** `.suplaunch` (z82 root context) paints over the sheet
   (overlay z4000 is trapped in MAIN's stacking context). Hidden under `body.zoning` + `#histOverlay.on`
   (guide §5.17). Verified display:none both cases.
3. **Radius row rebuilt to comp:** carved capsule track, keys flex inside, `mi` in-track, selected key =
   raised + muted-yellow 1.5px ring + yellow number (§8: no green selection next to green Add-all).
4. **Zone dialogs = bottom sheets (comp screens 3–4):** zPop (actions menu / rename / delete / check
   confirm) was a centered pop-up → now slides from the bottom edge, grab handle, drag-down dismiss
   (sheetDrag bound on create). Confirm CTA = yellow ring capsule like CHECK THIS ZONE (comp).
5. **"Edit stores" added to the zone actions menu** (comp had it; `zoneEdit()` existed but was
   unreachable). ES `'zones.editstores':'Editar tiendas'` same commit.
6. **Sheets 88vh→88dvh** (zones+history): visible-viewport height so the basket clears iOS Safari's
   toolbar; vh kept as fallback.
Comp items NOT built (superseded — do not re-introduce): name-text basket chips (owner 07-11: logos
only), "N checks · $" in basket/confirm (guide: no price/check-count anywhere in zone flow).
Flags found, not chased: run-report rows use emoji ✅❌📞 (guide §8 bans emoji — needs an owner call /
icon-set pass) · qa-design "off-system colors" fails on 12 LEGACY tokens (fails identically on HEAD
before my diff; mine removed one offender). Playwright-vs-proxy trap + local-verify recipe → GOTCHAS.
**BLOCKER for owner:** staging svc has `COMING_SOON=1` → staging.checkitforme.com shows the coming-soon
splash, so nothing can be reviewed there. I'm blocked from flipping service vars in this session
(permission wall). Owner: set COMING_SOON=0 on the staging svc (8165df7a…) or tell DevOps.

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
