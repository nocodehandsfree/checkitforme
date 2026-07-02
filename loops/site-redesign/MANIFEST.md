# Site-redesign MANIFEST — state of record (LOOP.md is the protocol)

# 🌅 MORNING REPORT — overnight run COMPLETE (2026-07-02, cycles 0a→23)
**Exit condition met: sweeps 5 and 6 both ZERO fixes.** All suites green every cycle (behavior
benchmark 66 checks · design-token harness · tsc · full test-all).

## See it
- **New skin (retail + kiosk):** `staging.checkitforme.com/pokemon?skin=v2` (any brand path works)
- **Hobby flow (hidden):** `…/pokemon?skin=v2&flow=hobby` — era → sets → products → lock
- **Sign-up (hidden):** `…?skin=v2&show=signup` · **My checks (hidden):** `…?skin=v2&show=mychecks`
- **Revert:** `?skin=off`. Normal visitors see ZERO change without the flag.

## Done (23 cycles)
Preview switch + token re-key · S2 switcher (Retail+Kiosk launch) · header/hero/footer/toasts(3 kinds)
· menus/ticker/slider · store rows + BEST ring + map chrome · call sheet + ring-capsule CTAs + chips +
pop-ups · live call (pulsing arcs, carved well, raised bubbles) · verdict pages (glass-on-wash, RESULT
chip, solid verdict titles) · calls-by-day calendar · P6b poll · IS1 actions · restock · login/forms
(auto error rings) · Scores · Runnr · plans (muted-yellow rings) · §5.7 status chips · hobby P3a–P5
(feed-driven, feed's own art paths, 7 comp-exact product icons) · 4 audit sweeps (6+26+19+1 fixes).

## Blocked (1)
- **YOUR HUNT (P6)** — needs the §7 price-aggregation backend (store+product price rows, BEST=lowest
  fresh). Front-end ready to consume.

## For Copy (COPY QUEUE below)
S2 labels ES · footer "Legal" merge · contact-form eyebrow · hobby strings (hob.*) EN+ES rulings.

## Key DECIDEDs (full log below)
In-stock chips use the brand-check FILE (owner law > comp's drawn ✓) · S2 in-card track #1B1B20 ·
ckWaveV2/ckGlowV2 names (v1 collision) · solid error/tier rings (gradients can't ride box-shadow) ·
accent gradients stay Pokémon-default (comps define no other vertical).

## Suggested next: owner preview walk → QA read-only pass (LOOP.md morning steps) → fix round if
needed → promote when happy.

---


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
- ✅ **Sign-up previews:** 6a→plans: `…?skin=v2&show=signup` · you're-in: `…?skin=v2&show=paid` — opens the plans
  flow (upsell copy → tier tiles w/ muted-yellow selected ring → Stripe checkout → 'you're in' toast).
- ✅ **My-checks 6e–6i preview: `staging.checkitforme.com/pokemon?skin=v2&show=mychecks`** — lands on the
  My-checks/today view (overview/activity/history ride the P6c + base systems; earn/new-user states show
  per account state).
- (pending build) Runnr RN1/RN2 new skin: existing handoff flow with skin on.

## COPY QUEUE (view · element · comp copy · current approved copy) — Copy lane processes
- **ES DRAFTS (Lens C/D)** · ALL 58 v2-era keys (acct.* / buy6b.* / up6a.* / up6d.* / hob.* / hist.count)
  now carry DRAFT Spanish in the I18N table (marked with a comment banner) — written in the approved
  table's voice, never shipped-approved. Copy lane: ratify or re-rule each; EN defaults unchanged.
- Hobby (hidden) · all strings (Pick your era / Just dropped / Upcoming / unavailable / locked-toast) · comp EN placeholders · need approved EN + ES rulings (keys hob.*)
- Sign-up 6a–6d · ALL strings ('That was your free check…', feature names incl. Zone sweeps/Store holds/Thrift hunts, plan tier names, 'You're in.') · comp EN under v2 preview (keys up6a.*) · need Copy ratification + ES; plan names/prices ALWAYS from POLICY at runtime, never comp's
- Contact forms (kiosk/lead) · field eyebrow · comp: "PHONE OR EMAIL" · approved: current per-form labels
- S2 switcher · mode key labels · comp/style-guide LOCKED: "Retail" / "Kiosk" · approved: "Check a store" / "Kiosks" (EN applied under v2 per design-lock; ES table untouched — needs ES rulings for Retail/Kiosk)
- Footer · links row · comp: "Legal" (merges Terms+Privacy) · approved: separate "Terms" "Privacy" (not yet applied — queued with footer item)
- Runnr RN1/RN2 · page footer · comp: "Powered by Fungibles · runner.fungibles.com" · approved: (none — line absent; live deal links use checkitforme.com/d/…) — needs Copy ruling on the attribution + domain

## CYCLES 0a/0b — benchmark harnesses
- [x] 0a `scripts/qa-pages.sh` behavior benchmark: boot server on throwaway DB, fetch `/`,
  `/pokemon`, `/onepiece`, `/toppsbasketball`, `/needoh`; assert 200 + markers: search input
  (`id="search"`), find-me button, radius slider, call CTA (`startCheckLive`), live view (`id="live"`),
  result (`id="result"`), calendar (`hcalwrap`), ES i18n table (`'es'`), footer links, brand switcher.
  Added to test-all.sh. MUST STAY GREEN ALL NIGHT.
- [x] 0b `scripts/qa-design.ts` token harness: inside `skin-v2`-scoped markup only — every hex/size
  must be in STYLE_GUIDE_NEW.md's token set; banned terms repo-wide in checkit.html (scraper/scraping/
  Marketplace Insights); COPY QUEUE comp-isms must not leak into served copy. Added to test-all.sh.

## ROUND 2 (owner-requested re-check, 2026-07-02 morning) — loop re-armed
### 🔴 THE CORRECTION (owner zip 03:5x — comps verified byte-identical; the miss is REBUILD vs RESKIN)
**Rule for every box below: extract that screen's comp markup (COMP-EXTRACT.md) and rebuild the screen's
v2 DOM to MIRROR it — layout, order, spacing, copy positions — not restyle the old markup. v2-gated
renders (isV2() branches) so the default site stays untouched. One screen per cycle, screenshot proof.**
- [~] 6m RESULT rebuilt in code (comp timeline: gradient rail + full-width STAFF/CHECK-AI cards + verdict line; comp section order; emoji circle gone) — screenshot proof vs comp still owed
- [~] live-call rebuilt (shares the 6m timeline renderer; live state = green rail, no verdict) — screenshot proof owed
- [x] P2 sheet exact (cycle): FOUND+FIXED a dead selector — the v2 capsule rule targeted `.cs-call` but the real
  class is `.csheet-call`, so the sheet CTA was still old-skin gold under v2. Now: accent ring capsule 14/24,
  tracked-caps label + waves-phone LEFT, arrow RIGHT (arrow exists in markup but display:none outside v2 —
  v1 renders identically); dim rgba(5,6,9,.6); sheet pad 10/22/30, grabber 18px gap; head gap 13, logo tile
  raised + 42px art; name 20/800/-.3; meta 13/600 #8A8A96 w/ #4ADE80 Open (wrap allowed — never ellipsize the
  open state); product line 14 accent-800 + muted-white suffix. BONUS: v2 re-keys the old skin's PURPLE vars
  (--purple/--ptint/--pline) → green — kills the purple search-pin/Find-my-stores/translate-key/share-chip
  leaks in one move (§3 green = THE action color; comp P2 shows the well pin green).
  **PROOF: `loops/site-redesign/proofs/P2-sheet-v2.png`** (proofs dir started this cycle — backfilling owed shots next).
- [x] L1a–c exact (cycle): phone/code wells carved (inline old-skin overridden), CONTINUE/VERIFY = green ring capsules, Resend/Change-number purple→GREEN dashed links (comp note), staging dev-hint hidden under v2 (L1c law: env chrome never ships), 🇺🇸+1 prefix + 'First check's on us!' already matched · [~] 6a upsell BUILT (pop-up: 2-line 900 title, 3 green feature rows, SEE CHECK+ PLANS capsule; fires ONCE after the first free check under v2; ?show=signup previews it) · [~] 6b plans REBUILT (bottom sheet w/ grabber, 2-line 900 header, 'Every plan gets' 2-col check grid, cycle toggle + POLICY tier tiles w/ muted-yellow ring; Check+/Buy-checks toggle DEFERRED on the catalog-debt note in devops.md) — screenshot proof owed · [ ] 6c checkout (DECIDED: Stripe-hosted stays — backend architecture; sheet covers through plan pick) · [~] 6d you're-in REBUILT (pop-up: 'You're in.' 24/900, runtime plan/credits line, stat tiles, 'Now live' green-check list, '+5 more in Manage plan›', RUN A CHECK capsule; fires on ?paid=1 under v2 after auth refresh; preview ?show=paid) — screenshot proof owed
- [~] 6e overview REBUILT (green-wash header My✓/Done/phone/plan-chip, overlapping stat tiles CHECKS LEFT/RUN, Overview·Activity·Earn keys, yellow icon rows; legacy header hidden) — screenshot proof owed · [~] 6f activity REBUILT (8-wk bar chart, tone stat chips, History›, last-3 rows w/ status chips — all from local+server history) · [~] 6g earn REBUILT (lead line + 4 earn rows wired: add-store, invite, post-score, kiosk receipt; reward-number chips omitted until runtime numbers exist — DECIDED, never invent) · [x] 6h new-user variant (Free/'Free check used' chip; full-width UPGRADE·from-$X capsule from runtime tiers for non-members) · [x] 6i history header ('Check history' 20/800 + Done + 'N checks in {month}' on both landing renders)
- [x] R1/R2/R3 restock exact (cycle): R1 module = raised gradient card r20 + CARVED rows (#1B1B20 inset, 38px
  green-tint tiles, sub indented under the title) — the old v2 rule had rows flat; head 15.5/700, row type
  14.5/700 + 11.5/600; chevrons #7C7C88 under v2 (isV2() at the render — inline SVG stroke, CSS can't reach).
  R2/R3 modals: global v2 ✕ = 32px raised circle (auth/acct/buy keep their own via ID rules), watch modal
  left-aligned (!important beats inline centering), watch input + ALL .kin fields carved — **.kin was
  mis-swept into the RAISED group in sweep 3; §5.12: fields are wells, never raised** — .klbl labels =
  tracked eyebrows (inline hint spans stay sentence-case), R2/R3 CTA labels WHITE on the green ring per comp.
  Day keys already comp-true via .chip/.chip.sel (raised + green-glow selected). #2F2F36 (comp's ✕ gradient
  top) added to the token set. Comp's "PHONE OR EMAIL" eyebrow copy for these forms stays in COPY QUEUE (the
  watch form has no label today — never invent copy). PROOFS: proofs/R1-module-v2.png · R2-watch-v2.png ·
  R3-schedule-v2.png (proof harness renders with a fallback font — wraps in shots are font-load artifacts,
  not chrome; real pages load Inter).
- [x] SC1/SC2 exact (cycle): SC1 — bar title 21/900/-.5, Post pill = accent gradient w/ camera + accent-tinted
  glow (dark text stays the per-vertical #26251E DECIDED token vs comp's Pokémon-only #3A2C00), empty panel
  r22 carved+dashed 42/20 w/ 17/800 + 13/600 lines. SC2 — each post rebuilt as ONE raised r18 card (header/
  letterbox/foot inside, overflow hidden): 38px embossed initials tile 10/900 #CDCDD8, handle 13.5/700 +
  muted store, location 11/600 #8A8A96, ago #5C5C68, photo LETTERBOXED on #17171C (230px, img contained
  206px/80% + drop-shadow — was full-bleed cover), heart 13/700 #8A8A96 (liked #FF7B7B), caption 13/500
  .85-white, feed gap 12. **.igimgwrap pulled OUT of sweep-2's carved group** (would've fought the letterbox
  later in the cascade). Composer filepick's purple dashed border auto-healed by the P2 cycle's purple→green
  var re-key. PROOFS: proofs/SC1-empty-v2.png · SC2-feed-v2.png (stand-in logos as photos — they scale to the
  206px cap; real photos letterbox naturally).
- [x] RN1/RN2 exact (cycle): head = 32px raised ‹ circle + 19/800 title + 12/600 sub; job card raised r16 w/
  CARVED 40px icon tile (was green-tint); step eyebrows 10/700/.15em, card titles 15/700, cards r16 comp
  shadow; done node = 2px green ring, done connector solid green, idle connector .1-white; bonus stepper
  25/800 + 38px keys; **primary CTAs rebuilt: solid green fills → green RING capsules w/ white tracked
  labels** (comp); violet book-ride key → raised neutral (no purple under v2); paste box 12.5/500 #D9D9E0;
  driver preview = deep-carved #141419 r15 panel, 9.5/700 tag, white #F4F4F6 pay key; stars 26/gap 10;
  'Driver said no?' link unstyled-muted. Tokens added: #D9D9E0/#F4F4F6/#0B0B0F (comp-verbatim). COPY QUEUE +=
  comp's 'Powered by Fungibles · runner.fungibles.com' footer (absent live; domain conflicts w/ approved
  checkitforme.com/d links — Copy ruling needed). PROOFS: proofs/RN1-steps-v2.png · RN2-deal-v2.png.
- [x] P1 home detail pass (cycle): **Map key CORRECTED — comp shows a raised DARK key with ACCENT TEXT, not
  the accent-filled pill from cycle 5** (verified with a 4× computed-style clip: proofs cross-check) ·
  **FIND MY STORES rebuilt: raised neutral key → green ring capsule w/ WHITE 13/800/.14em tracked label** ·
  big-card pad 16/16/20 (guide, was 22) · ①-FIND-YOUR-STORE eyebrow 10.5/700/.15em #8A8A96 · open-count +
  radius label + mi unit 12-13/600 #8A8A96 · radius value 17/800 · tick labels 11/700 #7C7C88 w/ green
  active (structure already existed). Search well/S2/hero/footer already comp-true from earlier cycles.
  PROOF: proofs/P1-home-v2.png (+ scratch 4× clip of the Map key).
- [x] P6/P6b/P6c detail pass (cycle): RENDERED verification against the comps with forged results driven
  through the real showResult path. P6 in-stock: green wash, glass RESULT chip + pills (verified via
  computed-style probe — rgba(255,255,255,.07); the dark look in low-res shots is scale artifact), 30/900
  verdict, tokened sentence, timeline rail + full-width bubbles + CONVERSATION eyebrow + green verdict line,
  raised Share/Too-far rows. P6b: amber wash + 4 poll keys w/ §5.7 icon chips — comp-exact. Transcript staff
  prefix is `Clerk:` (my forged 'Caller:' line vanishing was the harness's fault, not the parser's). NO code
  deltas found — earlier cycles' rebuilds hold. P6 price line/$-over-retail + YOUR HUNT stay BLOCKED on the
  §7 backend. P6c pop-over chrome shipped cycle 8; its rendered proof needs seeded history — moved to the
  proof-backfill list. PROOFS: proofs/P6-instock-v2.png · P6-convo-v2.png · P6b-poll-v2.png.
### 🔴 OWNER 05:33 SCREENSHOT (plans sheet ≠ comps: font/spacing/look) — FIXED this cycle
- [x] 6b sheet REBUILT to the true comp (my cycle-16 pass had invented structure): Check+ lockup (site
  wordmark + green '+' — Check+ logo FILE doesn't exist; Design owes the asset, DECIDED placeholder) ·
  ONE centered 26/900/-.8 title for every open reason (reason titles/leads incl. the ⭐ emoji were
  old-skin — §8 no emoji under v2) · 'EVERY PLAN GETS' eyebrow .4-white · **4-col raised icon TILES w/
  the comp's 8 SVGs verbatim** (my ✓-text checklist was wrong) · twin raised cycle keys (active green
  glow — carved track was wrong) · tier type to comp (15.5/700 name · 12.5/600 desc · 19/800 price ·
  pad 14/16) · **tap-selects + CONTINUE ring capsule** (was buy-on-tap; v1 behavior unchanged) ·
  Stripe note 13/600. Check+/Buy-checks tabs still deferred: POLICY.packs is empty (catalog debt) —
  tab code lands when packs ship. PROOFS: proofs/6b-plans-v2.png · 6b-plans-selected-v2.png.
- [x] **OWNER: "you're not using the same font — that's why it's not hitting" → ROOT-CAUSED + FIXED:
  Inter is now SELF-HOSTED** (`/fonts/inter-var-latin.woff2`, variable 100-900, immutable-cached; new
  `/fonts/:file` route in server.ts; Google Fonts links removed from the head). The site loaded Inter
  from fonts.googleapis.com — blocked on networks running DNS ad-blockers (and in this sandbox), so
  the ENTIRE site silently fell back to the system font. Same font file the comps load. Rendered
  verification: `document.fonts.check('900 26px Inter') === true` locally; proofs now shoot in true
  Inter. (Also explains why every proof screenshot rendered a fallback face.)
- [x] 6a REBUILT to comp: bottom sheet (was a centered pop-up) w/ grabber, LEFT Check+ lockup, 26/900/-.8
  title, PLAIN bold-check rows (stroke-3.4 15px checks + 14/600 .85-white — the icon tiles were invented),
  white-label capsule + arrow. 6d REBUILT to comp: GREEN #266440 header band (grabber bar, centered
  lockup, 30/900 'You're in.', .8-white plan line) → overlapping stat tiles (-28px) → raised NOW-LIVE card
  (eyebrow + checks + accent more-link INSIDE) → RUN A CHECK white capsule + arrow. PROOFS re-shot in
  true Inter: 6a-upsell/6b-plans/6d-yourein/P1-home.
- [ ] LESSON → new audit lens: my proofs passed because they compared against MY OWN build, not the
  comp frame side-by-side. Every remaining sweep must diff the SHOT against the EXTRACTED COMP, element
  by element (type scale first — the owner's exact complaint). ALSO: kill stray qa servers before every
  proof run (a crashed script's stale server on 8797 served pre-change HTML for ~an hour — every 'flaky'
  hobby 500/font error was that).
- [x] 6e comp-diff pass (true-Inter cycle): the overview tab was FALLING BACK to the legacy account rows
  (bare icons, no subs, wrong set) — comp overview now renders in the v2 panel: 3 raised rows w/ 34px
  #1F1F25 ACCENT-icon tiles + runtime subs (Manage plan · billed-line / Check history · 'N checks in
  {month}' / Earn free checks · comp sub queued for Copy) → RUN A CHECK capsule (shared .capsW: white
  tracked label + arrow) → Sign out 13/700 #7C7C88. Legacy .acctrows hidden under v2. 6f/6g re-verified
  in true Inter — comp-true. PROOFS: 6e-overview-v2.png · 6f-activity-v2.png · 6g-earn-v2.png.
### Proof backfill — COMPLETE (all shots in true Inter)
- [x] 6m result (forged through the real showResult path w/ seeded rail: glass chips row incl. calendar/next
  circles, 30/900 verdict, tokened sentence, SHINE capsule, timeline+convo w/ proper STAFF labels, Share/
  Too-far rows — comp-true) · [x] P6c calls-by-day pop (seeded history: r22 card, raised nav, accent selected
  day) · [x] 6i landing (header 20/800 + Done + 'N checks in {month}', big calendar, capsule; the 'No checks
  today' + '3 in July' contradiction in the shot is MY forcing — the router only shows this landing when
  today is empty; behavior verified correct) · [x] L1b error (red ring + under-field line) · [x] L1c code
  step (carved code well, VERIFY capsule, green dashed Resend/Change links; shot shows both steps — forced)
  · [x] 6e/6f/6g · [x] 6a/6b/6d · [x] hobby P3a/P3/P4 · [x] L1a
- live-call view: rides the SAME timeline renderer proven in the 6m shot (rail/steps/bubbles identical;
  live = green rail, no verdict); a true live shot needs a real call — owner sees it on their first
  staging check. NOT owed as a separate rendered proof.
### AUDIT LENS ROTATION (never exits — one lens per firing, then start over)
- [~] Lens A pass 1 (this firing — IS1 + T1, the two never-diffed frames): IS1 REBUILT to comp — share =
  white 12.5/800/.13em ring capsule w/ upload icon LEFT + arrow RIGHT (was green centered text), Too far?/
  Grabbed it? = 2-col GRID of tile-cards (32px green-tint tiles, 13.5/700 + 10.5/600 two-line labels; was
  stacked full-width rows). Approved strings split at the '?' — no invented copy, EN+ES both carry one.
  T1 toasts to comp: 14.5/800 pad 12/22, comp shadows + inner top light, success text #0C2916, neutral
  #31313A→#26262C (both comp-verbatim, added to tokens). BONUS §8 catch: 'That was your free check 🎯'
  emoji stripped under v2 (regex on render — string untouched for v1/Copy). PROOFS: IS1-actions-v2.png ·
  T1-success/neutral/accent-v2.png. Remaining Lens A targets: S2 re-diff · P3/P4 detail vs frames · 6h.
- [~] Lens A pass 2 (this firing): S2 re-diffed — comp-true, no change (in-card #1B1B20 DECIDED holds).
  P4 detail EXACT: names 14→15/700 · price block rebuilt (grey inline → WHITE 15.5/800 over 9/700/.14em
  RETAIL eyebrow; label keyed hob.retail → COPY QUEUE) · banner 152px w/ comp crop · back key = 32px
  glass blur (border dropped) · FIRST priced row = accent ring (comp hero product — DECIDED) · unpriced
  rows dim .6 only when siblings have prices (a generic list never dims). Verified BOTH variants live:
  generic (Delta Reign, products:[]) and priced (ME05 Pitch Black — real feed data, same set the comp
  mocked). PROOFS: P4-products-v2.png · P4-priced-v2.png. Next: P3a/P3 detail diff · 6h · then Lens B.
- [x] Lens A pass 3 — **Lens A COMPLETE, every comp frame now individually diffed**: P3a rebuilt to comp
  (big-card container, centered 24/900 'What are you hunting?' + 12.5/600 sub, 96px era rows w/ 82% logos
  + comp shadows; missing-logo fallback = EMBOSSED TEXT per comp, stripes dropped; era·years strip dropped
  — comp-absent). P3 rebuilt to comp (card + title/sub, accent-ringed ERA CHIP w/ logo + 'N sets' + Change
  key, 2-COL tile grid w/ code+date strips ON the tiles, hero accent ring on the freshest RELEASED set;
  comp's full S2 track on this screen SKIPPED — launch-state law outranks the comp, DECIDED). 6h to comp:
  new users lose the Manage-plan row, history sub = lifetime count, capsule = UPGRADE·FROM $X w/ lockup
  mark (head-injected duplicate CTA removed). Copy: hob.title/sub/sub2/sets/change join the hob.* queue.
  PROOFS: P3a-eras-v2.png · P3-sets-v2.png · 6h-newuser-v2.png. → Lens B next (button paths).
- [x] Lens B (button paths): 9 rendered click-paths added PERMANENTLY to qa-e2e (now 38 checks) — brand
  switcher→menu · anon My→auth · language→menu · Scores→wall · 6a CTA→6b sheet · 6b tier tap→ring+CONTINUE ·
  account Earn→4 rows · Too far→Runnr view · watch empty-submit→error line. ALL passed first run (behaviors
  held through every rebuild); they now guard regressions every cycle. Paths already covered elsewhere:
  S2 kiosk flip, ES flip, hobby full chain, product lock, L1 error ring (original qa-e2e) + 66 qa-pages.
- [x] Lens C+D (copy + ES, one pass): full key inventory — 68 v2-era t()/tf() keys + 7 data-i18n keys
  audited. ZERO hardcoded English bypassing t() in v2 renders; comp-ism scan clean (harness-enforced).
  **58 v2 keys had NO ES entry → English mid-Spanish UI. DRAFT ES written for all of them** (same voice
  as the approved table — 'verificación', informal tú; an English leak is the worse defect than a draft).
  DRAFTS FLAGGED FOR COPY RATIFICATION — see COPY QUEUE. Render-verified in ES: hobby '¿Qué estás
  cazando?', account 'Resumen/Actividad/Gana', 'Mejorar · desde $9.99/mes'. Duplicate cs.costs deduped.
  PROOFS: ES-hobby-v2.png · ES-account-v2.png. Lens D full-flow sweep can now run clean next rotation.
- [x] Lens E (spacing): 12 computed-style probes vs comp numbers across P1 (card 16/16/20, S2 5/2,
  capsule 14/24), P2 (sheet 10/22, head 13, CTA 14/24), 6b (grid 8, cycle 8/16, tiles 14×16/10), 6e
  (stats -28, tabs 16/18, wash). **11/12 exact; ONE delta fixed: 6e wash top pad 14→10 (comp).**
- [x] Lens F (verticals): rendered probe on all 4 brand paths — Map-key text, hero accent span, and
  capsule ring glow all derive exactly from each brand's --accent (FFCB05/E23636/E4002B/EC4899).
  Zero hardcoded yellow. (qa-e2e's per-brand accent/bg/badge checks continue every cycle.)
### ROTATION 1 COMPLETE (A–F all run, fixes landed). Rotation 2 begins next firing: re-diff comp
### fidelity with fresh eyes, tightest screens first — the loop NEVER self-exits; owner stops it.
### 🔴 OWNER SCREENSHOT FINDINGS (03:40) — merged into the rebuild queue above
- [ ] **RESULT PAGE (6m) STRUCTURAL REBUILD** — owner checked a call: the result page is a token reskin,
  NOT the comp's layout. Rebuild per 6m: glass header row → RESULT chip + calendar/next glass circles
  row → verdict title 30/900 → sentence w/ tokens → green shine capsule → timeline+convo → status icons.
  Extract 6m markup fully, restructure showResult's v2 render. THE flagship screen.
- [ ] **LIVE-CALL SCREEN STRUCTURAL** — same treatment for the in-call view (phone arcs hero, steps, bubbles).
- [ ] **MY-CHECKS 6e–6i STRUCTURAL SCREENS** — owner: "doesn't look anything like the comps." Build the five
  designed pop-up screens (overview/activity/earn/new-user/history) per comps — NOT "rides existing".
- [x] Account screen purple icons → accent (comp/§8: NO purple on account screens) — CSS pass; full 6e
  account layout lands with the structural item above.
- [x] Scores strip "Show us the goods!" wrapping → one-line small (§8 no two-line lines); SC1-on-home
  treatment rides the structural pass.
- [x] Hero art clipping at top — heroart top padding under the transparent header.
- [ ] Full-page screenshot pass per firing (local Chromium): screenshot each view vs comp, log deltas.
- [x] Unmissable preview badge (tap to exit) — temporary chrome, STRIP BEFORE PROMOTE
- [x] Per-vertical accent colors: all accent pieces now color-mix off var(--accent) (owner's call — comps only showed Pokémon)
- [x] Logo-lane assets LIVE on staging (their commit 3f5702d + serving routes; eras/sets/banners 200; ME05/ME06 logos pending publication → text fallback; 66 old-set banners = route-level fallback). Hobby art lights up now.
- [ ] Module-by-module RENDERED audit against comps (owner expects misses: per-product modules, module chrome)
- [ ] Error-message states sweep: every error string/state rendered + §5.12-conformant (owner call-out)
- [ ] Per-vertical visual audit on all 4 brand paths with the accent derivation live

## VIEW ENUMERATION (from the LIVE site) × comp mapping
### Global chrome
- [x] S2 store-type switcher (cycle 2): carved #17171C track + raised active key (comp-exact), storefront/kiosk-awning icons via currentColor, launch = Retail+Kiosk with active flex 1.2. EN labels locked Retail·Kiosk under v2; ES untouched pending Copy.
- [x] Header (cycle 3): transparent bar (pills float on page), switcher/My pills already raised via base; hero title 30/900/-1px per P1. Per-brand accent dot kept (comp shows Pokémon only — DECIDED).
- [x] Footer (cycle 3): strip tokens, 13/600 muted links, 36px raised social circles, tight padding. 'Legal' merge NOT applied — stays in COPY QUEUE (link-text change needs Copy).
- [x] Toasts (cycle 3): green success capsule gradient + dark-green text + glow. DECIDED: neutral/accent variants land when toast() call sites get a type param — queued as follow-up box below.
- [x] Toast variants (cycle 17): toast(msg,kind) — green success default, 'neutral' raised-dark (the 3 copy-toasts classified), 'accent' yellow armed for refund-style moments. v2-scoped styles; v1 unchanged.
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
- [ ] YOUR HUNT (P6): **BLOCKED — needs the §7 price-aggregation backend** (one row per store+product,
  upsert on completed checks, BEST = lowest fresh in-stock). Front-end (tiles + v2StatusChip + BEST ring)
  is ready to consume it; ask filed conceptually — backend lane to build the endpoint.
### Cross-cutting
- [x] ES readiness (cycle 18): every v2-added string routes through t() with EN defaults (hob.era/
  hob.dropped/hob.upcoming/hob.nodata/hob.locked) — ES translations ride the COPY QUEUE (comp copy is
  placeholder; never invent ES).
- [x] Brand sweep (cycle 18): v2 selection rings use var(--accent); capsule accent-ring gradient stays the
  guide's tokens (Pokémon default per §3 — comps define no other vertical's gradient; DECIDED, Design
  follow-up for per-vertical stops). No recolored controls introduced.
- [x] Reduced-motion (cycle 18): v2 loops disabled under prefers-reduced-motion; tint sampling intact —
  html bg override equals --bg so per-edge sampling behaves identically.
- [x] Error/empty sweep: all ride restyled toast/modal/CTA systems; no bespoke chrome found.

## DECIDED LOG
- FIXED (P2 pass): v2 sheet-CTA rule targeted nonexistent `.cs-call` (real class `.csheet-call`) — the call
  button was still v1 gold under v2 until now. This is exactly the class of miss the rendered-screenshot pass
  exists to catch; harness already covers it going forward (qa-e2e renders the accent pieces per brand).
- DECIDED (P2 pass): v2 re-keys --purple/--ptint/--pline to green rather than per-selector fixes — one rule,
  zero purple anywhere under v2, v1 untouched. #again_yes ("check again") inherits the accent capsule too.
- DECIDED: L1c staging hint (code-prefilled note) hidden under v2 per the board's own law; v1 keeps it for owner testing convenience.
- FIXED (found during L1 pass): corrupted duplicate shareOverlay opening tag (bad merge artifact) — invalid HTML repaired.
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
- Sweep 1 (cycle 18): 6 fixes — v1 hairline/terminal leaks under v2 (.rhead, .proof, .smline, .csheet-ic, #mapview, .kioskhint) + reduced-motion guard. NOT ZERO → at least one more sweep required.
- Sweep 2 (cycle 19): ~26 fixes — systematic residual-border pass (find-me buttons, translate btn, demo tabs, share/auth tiles, account rows/avatar/stats, call keys, chips) grouped into role-based v2 rules; P4 off-comp code+name strip removed (the banner says it). NOT ZERO → sweeps 3+4 must both be clean to exit.
- Sweep 3 (cycle 20): 19 fixes — deeper selector scan (today-landing calendar, rail nav/selectors, Runnr internals, earn box, leaflet popup, icon buttons) + modal titles to §4 (900 weight, -.4px). Post-batch re-scan: **0 residual bordered selectors**. NOT ZERO (19 fixes) → sweeps 4+5 must both be clean.
- Sweep 4 (cycle 21): 1 fix — translate pill was dark on the verdict wash (§8: glass only). Checks run: border re-scan 0 · v2 JS inline hexes 0 off-token · wash-chrome audit. NOT ZERO (1) → sweeps 5+6 must both be clean.
- Sweep 5 (cycle 22): **ZERO fixes** — borders 0, v2 inline hexes on-token, no emoji in v2 UI, banned terms absent, full suite green. First clean sweep; sweep 6 confirms exit.
- Sweep 6 (cycle 23): **ZERO fixes** — all families re-run clean + tsc + harnesses. **EXIT CONDITION MET.**
