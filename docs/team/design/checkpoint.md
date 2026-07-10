# Check - Design — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## Carry-over (2026-07-09 — iOS tint / Safari-chrome lane — for the new repo)

_Separate retiring chat (tint specialist). Lane: iOS status-bar/chrome tint + consumer status-page
polish, all on this staging branch (final rev marker `tonebake-r116` in checkit.html, PR #424).
Website dev owns view/mode/nav; I owned tint CSS only. 80-line cap waived for this section._

**Memory starts at:** the owner's first message (fresh-eyes mission: "fix iOS status-bar tint + stale
installed PWA", two screenshots). I can see the entire chat; no compaction marker.

### The platform model — PROVEN on the owner's device (tinttest1-8, since deleted); written nowhere else
- iOS 26 Safari paints BOTH chrome pieces (status strip + bottom plate) from ONE value: the ROOT
  element's declared `background-color`. It never samples page pixels (macOS does), it IGNORES
  `theme-color`, and a `background-image` on html leaves the colour layer in charge. Top ≠ bottom is
  impossible in browser Safari. The faint bottom hairline = iOS liquid-glass edge, not page content
  (owner verified against prod and conceded).
- FINAL DESIGN (owner: "fucking amazing"): **middle bloom** — in browser the root stays `#0C0C12`
  (both chrome joints blend invisibly) and the verdict wash blooms mid-page
  (`var(--bg) 0 → tone 110px → tone 230px → var(--bg) 100dvh`); STANDALONE keeps the to-the-top tint
  via a `display-mode: standalone` media block (it has no chrome). checkit.html "Verdict tone wash" block.

### PARTIAL / UNSURE / NO ANSWER
- **NO ANSWER — RAILWAY_API_TOKEN**: never provided; `/api/voice/live` pre-push check impossible
  (admin-gated). Proxy used instead: `/pub/community` empty = no live staging call. Ask again when needed.
- **UNSURE — standalone A2HS after the bloom change**: the media block should preserve the old
  to-the-top look, but the owner never explicitly re-verified the installed app post-r113(→r116).
- **UNSURE — base-skin timeline rows**: `.ctl-step-row` brightened to #DCDCE6 alongside the v2 fix;
  owner only reviewed the v2 skin. Non-v2 visitors see brighter step text nobody approved.
- **NOT DONE — production promotion**: prod still has the pre-bloom look. Promote = merge this staging
  branch into the prod branch when the owner says go (staging-first rule).
- **Candidate cleanup (LOW, works fine as-is)**: `ensureToneLoaded` one-shot reload + the sheet-open
  `:has(#acctOverlay.on)` root overrides are now redundant in BROWSER under the bloom (root already
  dark); still relevant/harmless in standalone. Remove only with on-device re-verification.

### Traps for whoever touches this next
- **v2 skin trap (cost 3 wasted rounds)**: the owner's devices run `?skin=v2` (localStorage
  `cifm_skin`) — result timeline renders through the v2 `ctlv2` component, NOT `.ctl-step-row`; its
  seconds colour was INLINE-hardcoded in the JS renderer (~line 4209). Style fixes must hit both skins.
- **Stale-device trap**: iOS restores tab snapshots; "refreshed" ≠ fresh HTML. `x-rev` meta in
  checkit.html is the deploy fingerprint — bump it on every checkit.html edit and check it on-device.
- Header is now `position:static` (scrolls away, Google-style — owner loved); body pads
  `env(safe-area-inset-bottom)`; `.site-footer` transparent + borderless. Don't reintroduce sticky
  header slabs, footer borders/backgrounds, scroll-triggered chrome colour swaps (owner hated the
  snap), bottom tone glows (owner: footer too coloured), or ANY `theme-color` meta.
- Service worker is a self-evicting tombstone (website dev, owner: "one site, always fresh") — never
  re-add caching. renderRunner (src/server.ts) bakes `tone-*` onto `<html>` for `?tone=` deep-links.
- Owner's process note for the new repo (from devops): testable 5-10 line contract BEFORE building;
  done = demonstrated on staging with evidence; outcome-first short-bullet replies.

## Carry-over (2026-07-07 — for the new repo)

_This chat retires; only the repo survives. Design (CD) lane. The full design-gap work + every owner
decision live on branch `claude/design-gap-analysis-c3jn91` (pushed → carries over) and draft PR #423.
This staging branch merged that work at commit `db937d7`, which is BEFORE my last reversal — see the
footer item below. 80-line cap waived for this section._

**Memory starts at:** the initial CD brief ("You are CD. Task: design gap analysis so we end up with
ONE style guide that matches the live site."). I see no earlier context and no compaction marker; if
context was compacted before that brief, I can't see it.

### STALE DECISION on this branch — fix in the new repo
- **Footer Terms/Privacy is WRONG on this branch.** The checkpoint body + `STYLE_GUIDE.md` §5.14 here
  still say a single **"Legal"** link. The owner **reversed** that: **keep `Terms` and `Privacy` as two
  separate links, no "Legal."** Correct final state is commit `7662e6a` on
  `claude/design-gap-analysis-c3jn91` (pushed). ACTION: set §5.14 links to
  `Scores About FAQ Contact Terms Privacy` (already matches live — no site change). Login stays
  **phone-only** (§5.12 here is correct).

### PARTIAL — capture gaps (recapture with `?skin=v2`)
- **Verdict/result page + "couldn't tell" poll**: never screenshotted — staging's *simulated* call
  never resolved to a verdict in the capture window. Copy for all 13 verdict states is documented from
  source (checkit.html ~4620–4660). Extend `docs/specs/design-gap/inventory.html`.
- **Calls-by-day pop-over**: not captured — `#calbtn` never became clickable headless. Spec = §5.10.

### NOT DONE — site bug (code fix; outside design's inventory-only scope)
- **Store-row logo fallback**: some rows render a broken-image placeholder instead of the embossed
  2-letter initials tile. Fix in `voice-caller/public/checkit.html` store-row render.

### NO ANSWER — owner never chose
- **Comp-copy scope.** I asked (AskUserQuestion UI failed; owner: "we don't get your question")
  whether to (a) keep the guide as copy-authority, (b) rewrite the copy baked into the comp board, or
  (c) rebuild the visual comp fresh. I defaulted to **(a)** — `STYLE_GUIDE.md` defers all words to
  `COPY_STYLE_GUIDE.md`, board's stale copy left as-is and declared superseded. (b)/(c) still open.
- **Watch PR #423?** I offered to subscribe to its CI/review events. Never answered.

### Traps + decisions learned here (written nowhere else)
- **THE SKIN GATE (biggest trap).** Staging's DEFAULT render is the OLD flat **v1** skin. The elevated
  comp look only appears with **`?skin=v2`** (sets localStorage `cifm_skin=v2`; boot logic
  checkit.html ~L37–38), gated off for normal visitors "until the owner approves the takeover." Review
  staging with `?skin=v2` or you review the retired look. This burned me — I shot v1 first and reported
  wrong drift, owner caught it.
- **"v3" is NOT a skin** — a service-worker/cache-version bump (fixes stale v1 sticking through
  Cloudflare on the owner's laptop). No v3 in code. Elevated skin = v2. Real launch action: **promote
  v2 to default** so normal visitors stop getting v1.
- **Owner design decisions (final):** footer = Terms + Privacy separate (above); login = phone only;
  mode-tab active icons ride the accent not green (§5.1); calendar selected day = green (§5.10); footer
  = one centered unified cluster (§5.14); plans = perk-icons + muted-yellow tier ring; sheets = grabber,
  no corner ×.
- **Copy authority:** `COPY_STYLE_GUIDE.md` owns ALL words; `STYLE_GUIDE.md` owns the look. Comp board
  copy predates the copy pass — copy guide wins on any conflict; don't trust wording baked in the comp.
- **One comp only:** `NEW_CHECK_COMPS.dc.html`; generated bundle archived
  (`docs/archive/NEW_CHECK_COMPS.bundle.html`). The `.dc.html` renders via
  `tsx scripts/render-comps.ts board` (needs `comps/vendor/`) — does NOT open standalone in a browser.
- **Capturing staging (tooling trap):** Chromium's TLS ClientHello is reset by the egress proxy —
  direct Playwright nav to staging fails (ERR_CONNECTION_RESET after CONNECT; curl/Node OpenSSL are
  fine). Workaround: a local Node reverse-proxy bridge (Node fetch through the proxy) serving staging on
  127.0.0.1, point Chromium at it; force the skin via addInitScript `localStorage.cifm_skin='v2'`.

### Waiting on
- Owner pick on comp-copy scope (a/b/c) — defaulted to (a).
- Owner: watch PR #423 or not.

---

## Current work

- **Design gap analysis — one style guide vs the live site.** Compared the comp
  (`STYLE_GUIDE.md` / `NEW_CHECK_COMPS.dc.html`) against `staging.checkitforme.com`.
  Side-by-side pictures: `docs/specs/design-gap/inventory.html`. Vote each line below —
  **site wins (fold into the guide) or comp wins (fix the site).** `✅` = already approved.

### Read this first — skin + comp status (resolved)
- **"v3" = a cache bump, not a new skin.** The elevated skin is still `?skin=v2`. The recent
  service-worker/cache-version bump (the "stuck stale design on my laptop / Cloudflare" fix) is what
  let you finally load it — so what you see now = the v2 elevated skin. There is no v3 in any branch.
- **v2 ≈ the comp.** The elevated look matches the guide. My first pass mistakenly shot the *default*
  render (still the old flat **v1** — gated off until you approve the takeover), so flat page / purple
  button / "Check a store" / green plan ring / corner × were all v1 artifacts, gone in v2. **The real
  action is: promote v2 to default so normal visitors stop getting v1.**
- **One comp now.** `NEW_CHECK_COMPS.dc.html` is the single visual comp; the duplicate bundle
  `NEW_CHECK_COMPS.html` is retired to `docs/archive/`. The guide, the comp, and the copy guide now
  reference each other (see `STYLE_GUIDE.md` header + `comps/README.md`).

### Reconciled INTO the guide (shipped decisions — no vote needed)
- **Mode-tab icons** now ride the brand accent, not green (commit 5bcb734) → §5.1 updated.
- **Calendar selected day** = Check-green, not accent-yellow (commit 977cbc7) → §5.10 updated.
- **Footer** = one centered, unified cluster (commit 9a39fd4) → §5.14 updated.

### Decided by owner → guide updated
- **Footer keeps `Terms` and `Privacy` as two separate links** — no "Legal" (owner reversed the
  earlier Legal idea). Matches live; no site change. NOTE: `STYLE_GUIDE.md` §5.14 on this branch still
  says "Legal" — stale, fix per the Carry-over section above (final state = commit `7662e6a`).
- **Login = phone number only**, no email (§5.12 updated; phone IS the login).

### Open — site bug (not a design vote)
- **Store-row logos** · never blank (chain PNG or embossed initials) · v2: some rows show a broken-image placeholder — should fall back to the initials tile.

### Copy (skin-independent — for the copy lane)
- **"No charge" wording** · guide: a green shield carries it — don’t write the words · site: verdict notes write "No charge." literally (checkit.html:4640–4648)
- **Em-dashes** · guide: banned · site: still in `notify.ts` email subject/headline + toast "…any town." (3264)
- **Banned names** · guide: never CheckIt/Runnr · site: `notify.ts` still sends sender "CheckIt" + "Runnr" footer
- **Email templates** · one voice · site: two divergent systems in `alerts.ts` (plain vs branded) for the same events

### Already approved — confirmed present in v2 (fast-yes ✅)
- Elevated skin, raised cards, green ring CTAs · Launch nav = Retail + Kiosk · Plan perk-icons +
  yellow tier ring · Sheet grabber, no corner × · "No answer = no charge." · Check It For Me /
  Check+ (not Fungibles/Fungie+) · "1 check used" (no "Powered by").

### Not re-shot in v2 (gaps to close next pass)
- Full verdict page + "couldn’t tell" poll (simulated call didn’t resolve in the window), and the
  calls-by-day pop-over (`#calbtn` wouldn’t click). Recapture with `?skin=v2`.
