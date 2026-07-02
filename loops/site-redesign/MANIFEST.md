# Site-redesign MANIFEST — state of record (LOOP.md is the protocol)

_Morning report goes HERE at the top when the exit condition is met._

## OWNER DIRECTIVES (law — supersede LOOP.md/kickoff where they conflict)
- 2026-07-02 kickoff: new design for **RETAIL + KIOSK** store types ONLY as the exposed launch state
  (S2 track ships Retail+Kiosk active — style guide §5.1 "launch state").
- 2026-07-02 **override** (owner, supersedes DevOps's "do not build hobby"): **BUILD the hobby
  screens (P3a/P3/P4/P5) fully — HIDDEN.** Owner wants to preview them; they must never be reachable
  by normal users or roll out to production exposed. Same hidden treatment as all not-yet-exposed pages.
- **Thrift**: still NOT built (no comps exist beyond the S2 label; owner's override named hobby only).
  S2 shows the launch (Retail+Kiosk) state; the full 4-key track is the hidden expansion state.
- **Every comp page gets built** (visible or hidden). The manifest's HIDDEN PAGES section documents
  exactly how the owner reaches each hidden page.
- **Hobby data**: `GET /pub/pokemon-sets` (live on staging) = the record of truth. 13 eras / 129 sets,
  presentation-ordered, `kind: main|special`, future releases stay (badge upcoming), `products[]` may
  be empty → generic type list, never print a price for `retail: null`. Pull fresh (5-min server
  cache), never bundle a copy. **Never invent set/era/product data.**
- **Data corrections vs the comp grid** (re-key from the feed, the comp is stale): Ascended Heroes =
  ME2.5 (Jan 2026), ME03 = Perfect Order (Mar 2026, missing from comp), Mega Evolution era = 7 sets
  (ME01…ME06 + ME2.5). The comp's era screen has BROKEN img markup on the Mega Evolution card
  (raw style=/alt= text visible) — build era logos from the feed + logo wall, not the comp's card.
- **Hobby logos/banners** (rev. Data Dev 2026-07-02): the FEED carries same-origin `logo`/`banner` paths
  per era + set (`/logos/sets/*.png`, `/logos/set-banners/*.png`) — rendered as-is; placeholder until the
  logo lane's files land, then they light up on their own. Never guess paths.
- **Hobby flow = sports cards + TCG only.** Never NeeDoh/non-card products.
- **COPY**: existing approved copy is truth; comp copy is placeholder → COPY QUEUE below (LOOP.md rule).

## PREVIEW MODE — ✅ LIVE (cycle 1)
**Owner: open `staging.checkitforme.com/pokemon?skin=v2`** → new skin ON for that device (persisted);
`?skin=off` reverts. Scope = `html[data-skin="v2"]` + `/*V2*/` CSS blocks — the default site render
is untouched for normal visitors. qa-design.ts audits only inside that scope.

## HIDDEN PAGES — how the owner reaches each (filled in as built)
- ✅ **Hobby flow (P3a→P4→P5): `staging.checkitforme.com/pokemon?skin=v2&flow=hobby`** — era picker →
  set banners (JUST DROPPED / UPCOMING badges) → product list (feed prices; generic types when empty) →
  tap a product = locks it onto the call flow (specific-product), back on the store picker. Back keys
  navigate up the chain. Unreachable without the v2 skin (hard `isV2()` gate; no visible links).
- ✅ **Sign-up 6a–6d preview: `staging.checkitforme.com/pokemon?skin=v2&show=signup`** — opens the plans
  flow (upsell copy → tier tiles w/ muted-yellow selected ring → Stripe checkout → 'you're in' toast).
- ✅ **My-checks 6e–6i preview: `staging.checkitforme.com/pokemon?skin=v2&show=mychecks`** — lands on the
  My-checks/today view (overview/activity/history ride the P6c + base systems; earn/new-user states show
  per account state).
- (pending build) Runnr RN1/RN2 new skin: existing handoff flow with skin on.

## COPY QUEUE (view · element · comp copy · current approved copy) — Copy lane processes
- Contact forms (kiosk/lead) · field eyebrow · comp: "PHONE OR EMAIL" · approved: current per-form labels
- S2 switcher · mode key labels · comp/style-guide LOCKED: "Retail" / "Kiosk" · approved: "Check a store" / "Kiosks" (EN applied under v2 per design-lock; ES table untouched — needs ES rulings for Retail/Kiosk)
- Footer · links row · comp: "Legal" (merges Terms+Privacy) · approved: separate "Terms" "Privacy" (not yet applied — queued with footer item)

## CYCLES 0a/0b — benchmark harnesses
- [x] 0a `scripts/qa-pages.sh` behavior benchmark: boot server on throwaway DB, fetch `/`,
  `/pokemon`, `/onepiece`, `/toppsbasketball`, `/needoh`; assert 200 + markers: search input
  (`id="search"`), find-me button, radius slider, call CTA (`startCheckLive`), live view (`id="live"`),
  result (`id="result"`), calendar (`hcalwrap`), ES i18n table (`'es'`), footer links, brand switcher.
  Added to test-all.sh. MUST STAY GREEN ALL NIGHT.
- [x] 0b `scripts/qa-design.ts` token harness: inside `skin-v2`-scoped markup only — every hex/size
  must be in STYLE_GUIDE_NEW.md's token set; banned terms repo-wide in checkit.html (scraper/scraping/
  Marketplace Insights); COPY QUEUE comp-isms must not leak into served copy. Added to test-all.sh.

## VIEW ENUMERATION (from the LIVE site) × comp mapping
### Global chrome
- [x] S2 store-type switcher (cycle 2): carved #17171C track + raised active key (comp-exact), storefront/kiosk-awning icons via currentColor, launch = Retail+Kiosk with active flex 1.2. EN labels locked Retail·Kiosk under v2; ES untouched pending Copy.
- [x] Header (cycle 3): transparent bar (pills float on page), switcher/My pills already raised via base; hero title 30/900/-1px per P1. Per-brand accent dot kept (comp shows Pokémon only — DECIDED).
- [x] Footer (cycle 3): strip tokens, 13/600 muted links, 36px raised social circles, tight padding. 'Legal' merge NOT applied — stays in COPY QUEUE (link-text change needs Copy).
- [x] Toasts (cycle 3): green success capsule gradient + dark-green text + glow. DECIDED: neutral/accent variants land when toast() call sites get a type param — queued as follow-up box below.
- [ ] Toast type variants (T1): classify toast() call sites → success/neutral/accent capsules (comp T1)
- [x] §5.7 status ICON chips (cycle 12): shared v2StatusChip(tone,size) — tinted circle + stroke icons (truck w/ day tone, ✕, bold ?); IN-STOCK uses the owner's brand-check FILE per the standing logo rule (DECIDED — owner law beats comp's drawn ✓). Day list swapped off colored dots; poll already chip-based; YOUR HUNT consumes it when hobby builds.
- [x] Page bg/tokens (cycle 1): CSS-var re-key under html[data-skin=v2] (--bg/--sheet/--terminal/--border) + base card/store-row/input/pill/footer surfaces — washes + iOS tint adapt via var(--bg)
- [x] Finds ticker (cycle 4): chips → raised row cards (NO COMP — extended system)
- [x] Language switcher (cycle 4): trigger covered by base pill styling; menus (vsw-menu incl. lsw) → big-card surface, no border
### Retail home (P1)
- [ ] Hero (brand art, headline, sub) per P1
- [x] Store search well (cycle 1 base carved input; find-me untouched — sits inside the well) 
- [x] Radius slider (cycle 4): carved track + 24px white thumb + green glow (webkit+moz)
- [x] Store rows (cycle 5): chain-logo slots #1F1F25, embossed initials tile for independents (:has(img) split), selection ring accent + #23232A fill. In-list stock check stays hidden (existing owner call). Status ICON CHIPS (§5.7) land with the verdict/YOUR-HUNT items where statuses actually render.
- [x] Best-bet row (cycle 5): green selection ring + soft glow via .store:has(.besttag)
- [x] Map chrome (cycle 5): Map/List toggle = accent gradient pill; legend = raised pill
- [x] Store-types pre-location overview: covered by base card/row tokens (NO COMP — no bespoke chrome needed)
- [x] Empty/far states: ride card/CTA/system tokens (NO COMP — no bespoke chrome)
- [x] Kiosk tab (cycle 5): rows/hint ride the same row-card + well system; S2 kiosk key done in cycle 2
### Call sheet (P2)
- [x] Call sheet P2 (cycle 6): big-card sheet (radius 28 top, 40×5 grabber), raised keys, chips light green when on, call CTA = accent-ring capsule w/ tracked caps (CSS uppercase — copy string unchanged). Green-ring capsule = all primary .cta.
- [x] Pre-call gates + all overlays (cycle 6): pop-ups = big card r26 over rgba(5,6,9,.66) dim, no grabbers
### Live call (6m)
- [x] Live call 6m (cycle 7): phone arcs pulse (ckWaveV2, staggered .35s — split ICO.call arc paths), message well carved, bubbles raised, CHECK AI green / STAFF muted labels; RESULT-chip breathing dot armed for the verdict cycle. Timeline verdict colors ride existing classes.
### Result / status pages (P6, P6b, P6c, IS1)
- [x] Verdict wash chrome (cycle 8): glass pills/nav on rview (never dark on wash §8), RESULT chip glass + verdict-tinted border + breathing dot; washes auto-matched comp via --bg re-key
- [x] Verdict title/sentence (cycle 8): title solid verdict color 30/900 (in-stock gradient killed under v2), sentence 16/500 .65-white. Price line + over-retail #F59E0B land with the quoted-price feature (needs price in result payload — reopen if P6 dev-note aggregation ships). DECIDED: fillP token color stays white (shared fn); per-tone token tint queued as polish.
- [x] Timeline + conversation: carved well + raised bubbles + labels shipped in cycle 7 (shared with live view)
- [x] Verdict line/'N checks used'/footer: ride base type/muted tokens — no bespoke chrome in comp
- [x] P6b poll (cycle 9): wrapping box gone, keys raised on-page, 34px icon chips, press-dip. §5.7 stroke-icon swap rides the chip-set item below.
- [x] IS1 (cycle 9): SHARE = green ring capsule (tracked caps via CSS), Too far?/Grabbed it? = raised press-dip cards w/ green tiles. Hobby's Too-far-only rule rides the hobby build.
- [x] Restock module shell (cycle 9): raised card + green icon tiles. R2/R3 modal internals covered by pop-up + form specs; REOPEN after visual pass if the comps' inner layouts diverge.
- [x] Calls-by-day P6c (cycle 8): calendar card r22, raised nav keys, accent selected day, 1.5px white today outline, day-list rows raised + accent ring on selected. Status ICON chips in day rows → with the §5.7 chip item.
- [ ] Feedback thanks / no-charge lines (NO COMP — extend)
### Log in (L1a/L1b/L1c)
- [x] L1a (cycle 10): carved well (base) + italic muted placeholder. 'PHONE OR EMAIL' eyebrow applies to CONTACT fields (kiosk/lead), not phone-auth — queued in COPY QUEUE for those forms.
- [x] L1b (cycle 10): 2px red ring on the well via :has(err:not(:empty)) — zero JS; under-field line 12.5/600 #FF7B7B left-aligned. DECIDED: solid #EF4444 ring (comp's gradient ring can't ride box-shadow).
- [x] L1c (cycle 10): code well carved via base; dashed-green sentence links in modals; no env chrome present.
### Sign-up / plans (6a–6d) — HIDDEN until owner exposes
- [x] 6a–6d (cycle 16): raised plan tiles + muted-yellow selected ring (solid-ring approximation of the comp gradient — DECIDED), billcycle rides the carved toggle, checkout/'you're in' ride modal+toast systems. Deep-linked for preview.
### My checks (6e–6i) — HIDDEN
- [x] 6e–6i (cycle 16): all ride the restyled My-checks systems (today landing, calendar/day list, account modal); deep-linked for preview. Comp-detail deltas → audit sweep.
### Scores (SC1/SC2)
- [x] SC1 (cycle 11): dashed carved panel + accent Post pill · [~] SC2 feed: cards ride the raised row system; photo letterbox strip to verify in audit sweep (feed markup renders from community data)
### Runnr (RN1/RN2)
- [x] RN1/RN2 shells (cycle 11): 30px nodes (active solid green + halo, done green outline), 2px connector, raised step cards idle@50%, carved toggle w/ raised active key. Driver-preview/star details to verify in audit sweep.
### Hobby (P3a/P3/P4/P5) — BUILD, HIDDEN (owner preview only)
- [x] P3a era picker (cycles 13+15): feed-driven, era art = feed's own `era.logo` path (onerror → §5.17 placeholder w/ Inter label), press-dip
- [x] P3 set picker (cycle 13): banner IS the tile (cover 112px, no overlays/names), JUST DROPPED chip (≤45d), UPCOMING glass badge on future releases (kept, never dropped), code+date strip
- [x] P4 product picker (cycle 13): full-bleed banner card top + floating back key; carved 38px tiles; feed retail anchors; products:[] → generic list; retail:null never prints. DECIDED: single carton icon this pass — the 7-type icon set (§5.13) is its own box below.
- [x] Product-type icon set (cycle 14): all 7 comp-exact icons extracted from P4 + loose name matching (feed types like 'ETB'/'Elite Trainer Box' both hit); carton fallback for unknown types
- [x] P5 (cycle 13): product pick sets SEL_PRODUCT (set name + type) + toast, returns to the store picker; the call sheet carries it as the specific product
- [ ] YOUR HUNT (P6 section: logo tiles + status chips + BEST ring + price aggregation dev-note rules §7)
### Cross-cutting
- [ ] ES (Spanish) parity for every new/changed string (i18n table)
- [ ] All 4 brand verticals render the v2 skin correctly (accent per vertical, no recolored controls §8)
- [ ] Reduced-motion + iOS tint sampling preserved (do NOT break the top-wash mechanism — checkit.html L6-14 comment)
- [ ] Error/empty states sweep (network fail toasts, callgone, no-credits)

## DECIDED LOG
- DECIDED: comp animation names collide with the existing ripple `ckWave` — v2 uses ckWaveV2/ckGlowV2 (same curves as §5.3; the guide's requirement is the behavior, not the name).
- DECIDED(rev. cycle 3): S2 track fill = #1B1B20 — the standalone S2 comp shows #17171C (on page bg) but P1's IN-CARD track is #1B1B20, matching guide §5.1; the live track sits in the card.
- DECIDED: apex `/` is host-routed (localhost serves Admin) — 0a benchmarks the 4 brand paths, which are the consumer surface.
- DECIDED: preview switch = `?skin=v2` / localStorage `cifm_skin` / `body.skin-v2` scope (cycle 1).
- DECIDED: 0a harness as bash boot-script matching repo's test-growth.sh integration pattern (LOOP
  names .ts; repo convention wins, tsx does the asserts where non-trivial).
- DECIDED: thrift screens not built (owner override named hobby only; no thrift comps exist).

## BLOCKED LOG
- (none yet)

## AUDIT SWEEPS
- (none yet)
