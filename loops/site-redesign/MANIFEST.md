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
- **Hobby logos/banners**: `checkitforme.com/logo-wall` (Logo lane, still building it out — use what
  exists; missing art → art-placeholder pattern per style guide §5.17, note in HIDDEN PAGES).
- **Hobby flow = sports cards + TCG only.** Never NeeDoh/non-card products.
- **COPY**: existing approved copy is truth; comp copy is placeholder → COPY QUEUE below (LOOP.md rule).

## PREVIEW MODE (how the owner sees the new skin)
DECIDED (cycle 1): `?skin=v2` on any page turns the new skin ON for that device (persisted in
localStorage `cifm_skin`); `?skin=off` reverts. Redesign CSS/markup is scoped under `body.skin-v2`
+ `data-v2` blocks so the default site is byte-identical for normal visitors. qa-design.ts audits
only inside that scope.

## HIDDEN PAGES — how the owner reaches each (filled in as built)
- (pending build) Hobby era picker (P3a): with `?skin=v2` on → long-press the S2 "Retail" key 1.5s
  OR visit `/?skin=v2&flow=hobby`. Exact mechanism finalized when built; this line updates then.
- (pending build) Hobby set picker (P3) / product picker (P4) / product-locked call sheet (P5):
  reached from P3a chain.
- (pending build) Sign-up 6a–6d (upsell → plans → checkout → you're in): `/?skin=v2&show=signup`.
- (pending build) My-checks 6e–6i (overview/activity/earn/new-user/history): `/?skin=v2&show=mychecks`.
- (pending build) Runnr RN1/RN2 new skin: existing handoff flow with skin on.

## COPY QUEUE (view · element · comp copy · current approved copy) — Copy lane processes
- (empty — filled as comp copy diverges from approved during implementation)

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
- [ ] S2 store-type switcher replaces the Check-a-store/Kiosks mode tabs (comp S2; launch = Retail+Kiosk)
- [ ] Header: brand logomark/wordmark, product switcher pill (vsw), My/auth pill (comp P1 header)
- [ ] Footer new skin: one-line links w/ Legal merge + EN pill; wordmark ©2026 + Discord/X circles (comp/§5.14) — NOTE Legal merge = copy change → COPY QUEUE
- [ ] Toasts → bottom capsule system (comp T1, §5.4)
- [ ] Page bg/tokens: #1D1D22 page, cards #26262B, no hairline borders — global v2 base CSS
- [ ] Finds ticker (community finds strip) → strip token #17171C (NO COMP — extend system)
- [ ] Language switcher (EN/ES pill + menu) restyle (NO COMP — extend)
### Retail home (P1)
- [ ] Hero (brand art, headline, sub) per P1
- [ ] Store search well (carved input) + 📍 find-me
- [ ] Radius slider → §5.17 well/slider (24px white thumb, green glow)
- [ ] Store rows → §5.6 (logo slot sizes, embossed initials for independents, status icon chips §5.7)
- [ ] Best-bet row (BEST ring = green selection ring §5.5)
- [ ] Map view chrome (legend pills, Map/List pill — accent yellow Map pill per §3)
- [ ] Store-types pre-location overview (store_count/types) (NO COMP — extend)
- [ ] Empty/far states ("not in your area yet" waitlist) (NO COMP — extend)
- [ ] Kiosk tab → Kiosk key content (kiosk rows, kiosk hint card) (comp P1 kiosk state + §5.1 icon)
### Call sheet (P2)
- [ ] Store-picked bottom sheet: grabber, category chips, specific-product field, call CTA capsule (accent ring "CHECK THIS STORE")
- [ ] Pre-call gates (last-call reminder / 24h confirm) → pop-up spec §5.11 (NO COMP — extend)
### Live call (6m)
- [ ] Live view: phone icon ckWave arcs, step timeline (2px line, 3 dots), streaming bubbles (STAFF muted/CHECK AI green labels), Stop & hang up (owner/comp only)
### Result / status pages (P6, P6b, P6c, IS1)
- [ ] Verdict wash pages (in/out/unclear/soon) + glass pills + RESULT chip ckGlow
- [ ] Verdict title/price/sentence format (§5.8, max 2 lines, tokens bold, over-retail #F59E0B)
- [ ] Timeline + conversation restyle (carved wells, bubble labels)
- [ ] Verdict line + "N checks used" + footer
- [ ] Couldn't-tell 4-key poll → raised keys w/ status icons (P6b)
- [ ] In-stock actions (IS1): SHARE YOUR SCORE capsule + Too far?/Grabbed it? 2-up (retail); hobby = Too far? only (hidden w/ hobby)
- [ ] Restock module → R1 panel / R2 tell-me / R3 auto-check comps
- [ ] Calls-by-day calendar pop-over + day list (P6c: accent selected day, white today outline, status chips)
- [ ] Feedback thanks / no-charge lines (NO COMP — extend)
### Log in (L1a/L1b/L1c)
- [ ] Phone number pop-up (L1a: carved well, italic placeholder, PHONE OR EMAIL eyebrow rule §5.12)
- [ ] Error state (L1b: 2px red ring + under-field line, never floating)
- [ ] Verify code (L1c: code wells; NO env/staging chrome in UI)
### Sign-up / plans (6a–6d) — HIDDEN until owner exposes
- [ ] 6a upsell · [ ] 6b plans (muted-yellow tier rings §3/§5.5) · [ ] 6c checkout · [ ] 6d "You're in" toast/state
### My checks (6e–6i) — HIDDEN
- [ ] 6e overview · [ ] 6f activity · [ ] 6g earn · [ ] 6h new-user · [ ] 6i history
### Scores (SC1/SC2)
- [ ] SC1 empty state (dashed carved panel, trophy, Post capsule) · [ ] SC2 feed (raised cards, photo letterbox)
### Runnr (RN1/RN2)
- [ ] RN1 set-the-deal (5-step rail, bonus stepper, job chip) · [ ] RN2 wrap-up (rating stars, driver preview)
### Hobby (P3a/P3/P4/P5) — BUILD, HIDDEN (owner preview only)
- [ ] P3a era picker from /pub/pokemon-sets (era logos on page, press-dip; logo-wall art, placeholders where missing)
- [ ] P3 set picker (banner tiles, JUST DROPPED chip, code+date strip, no set names; future sets badged not dropped)
- [ ] P4 product picker (carved icon tiles + retail anchors; products:[] → generic type list; never a price for retail:null)
- [ ] P5 product-locked call sheet
- [ ] YOUR HUNT (P6 section: logo tiles + status chips + BEST ring + price aggregation dev-note rules §7)
### Cross-cutting
- [ ] ES (Spanish) parity for every new/changed string (i18n table)
- [ ] All 4 brand verticals render the v2 skin correctly (accent per vertical, no recolored controls §8)
- [ ] Reduced-motion + iOS tint sampling preserved (do NOT break the top-wash mechanism — checkit.html L6-14 comment)
- [ ] Error/empty states sweep (network fail toasts, callgone, no-credits)

## DECIDED LOG
- DECIDED: apex `/` is host-routed (localhost serves Admin) — 0a benchmarks the 4 brand paths, which are the consumer surface.
- DECIDED: preview switch = `?skin=v2` / localStorage `cifm_skin` / `body.skin-v2` scope (cycle 1).
- DECIDED: 0a harness as bash boot-script matching repo's test-growth.sh integration pattern (LOOP
  names .ts; repo convention wins, tsx does the asserts where non-trivial).
- DECIDED: thrift screens not built (owner override named hobby only; no thrift comps exist).

## BLOCKED LOG
- (none yet)

## AUDIT SWEEPS
- (none yet)
