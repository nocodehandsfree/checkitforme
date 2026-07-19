# Check - Design — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## 2026-07-18 — QUEUED "we're slammed" holding card comped (CD)
- New check-status state: all call slots full, the check can't start yet (no transcript). A calm
  holding moment, **never an error** — no "line"/"queue" language anywhere (owner).
- Comp: `comps/QUEUED_HOLDING_CARD_COMP.dc.html` (standalone `.dc.html`). Contained in-stock green
  wash (§3) + glass chrome (§5.4); store row (§5.6) with the real chain logo; one-line headline
  "We're slammed." (§8); subhead = two sentences, break lands on the period (COPY hard rule 2); glass
  timer well "Check starts in 0:30" (accent `#FFCB05`).
- EN+ES copy, token refs, and Webbie build notes live in the comp file's header comment. The 30s
  countdown is a COMP DEMO only; real value is server-driven.
- **OPEN:** source of the 30s value + exact `0:00` → live-call view handoff; fold into
  `WEBSITE_COMPS.dc.html` on the next board regen.

## 2026-07-17c — SHEETS CAN GHOST: variant H WINS (owner-verified)
- **THE FULL RECIPE, final:** while a sheet is open, (1) dim = content filter (never an overlay),
  (2) root colour constant, (3) the sheet is ABSOLUTE page-layer content, not position:fixed —
  anchored at `scrollY + 14% viewport`, height overshooting ~120px into the bar zone, background
  scroll locked (overflow:hidden on html+body; sheets lock scroll anyway). Fixed sheets live in the
  UI layer Safari never ghosts; absolute sheets are page paint → the glass ghosts their rows under
  the toolbar. Reference: /sheetpeek variant H (src/server.ts).
- Rollout: Webbie (site sheets: acct/buy/page/csheet + messenger), Addie (admin) — swap fixed→absolute
  on open, restore on close; keep close-drag; remove big bottom padding inside sheet bodies (content
  must reach under the bar; scroll-end spacer keeps last row reachable).

## 2026-07-17b — GLASS MAP COMPLETE (owner-verified, /sheetpeek variants A-G)
- **Three proven laws:** (1) fixed sheets are NEVER ghosted by the scroll-edge glass — Safari treats
  them as UI; their under-toolbar zone reads as the sheet surface, full stop. (2) PAGE-STATE views
  (in-flow document content, like zones) get full glass, both edges, automatically. (3) with
  overlay-dims replaced by content filter-dims, sheets no longer damage the page behind them —
  open/close safe everywhere (live on site + admin).
- **Bottom "solid" on dark pages = content contrast**, not a bug: content passes under the bar
  (pixel-measured); dark-on-dark + Safari blur reads flat; bright content ghosts.
- **Frost (backdrop-filter) works** but only reads frosted over bright/coloured backdrops.
- **Per-surface design decision (owner):** sheet (clean, not glassy at bottom) vs page-state (full
  glass). No third option exists on iOS 26.

## 2026-07-17 — SLIDE-UP TRANSPARENCY: SOLVED, owner-verified in the /sheetpeek sandbox
- **THE RULE: never cover the page with a full-screen dim overlay.** A fixed rgba dim layer is the one
  thing that kills iOS 26's scroll-edge glass (the "translucent top/bottom" = Safari drawing page
  content through its bars). Owner A/B/C/D/E-tested on-device: dim overlay alone = glass dies; sheet
  alone, filter-dim, sheet+filter-dim = glass LIVES through open → scroll → drag-close → reopen.
- **THE RECIPE (variant E, proven):** sheets stay exactly as built (fixed, transformed, unchanged);
  the dim becomes `body.filterdim main,body.filterdim header{filter:brightness(.45)}`-style darkening
  of the page content itself — nothing sits between the content and the glass. Plus the r120 rule:
  the root colour never changes in-page.
- **ROLLOUT (pending owner go, one surface per push):** site sheets (acct/buy/page/csheet — swap
  `.overlay`/`.csheet-bd` dims for content filter), messenger (also remove its root recolor
  `html:has(.supwrap.on)` ~line 342), Admin (`app.html` same audit). Reference implementation lives at
  `/sheetpeek` (src/server.ts) — keep until rollout lands.

## 2026-07-16 — iOS chrome tint lane (tint specialist chat; Webbie takes the live page next)
- **Staging = `baseline-r122` (`fb80f5c`).** v2 root colour is CONSTANT `#1D1D22` — sheet-open override
  scoped `html:not([data-skin="v2"])`. Fixed: chrome no longer freezes dark through live calls.
- **PLATFORM (proven on owner's iPhone, constraint comment at checkit.html ~310):** chrome = root
  `background-color`, re-read ONLY at load/main-scroll → in-page recolor during sheets = impossible
  (4 attempts reverted). Top strip renders ~50% of root; bottom zone gets a light haze — accepted.
  Edge-compensation veils tried + reverted (muddied blooms) — do NOT re-add.
- **Owner's black top during test checks = iOS in-call UI** (they answer the Fun store call as the
  clerk). Not a page bug; real users unaffected. Self-test: don't answer → no green timer → blends.
- **FOR WEBBIE (owner-approved direction):** (1) BUG — `.rhead.live` green halo clipped by a wrapper
  above `#live`; unclip. (2) BUILD — green middle-out "call in progress" bloom on the live view (copy
  verdict-bloom geometry, rules ~280), glowing card (liveGlowV2 exists) + streaming transcript;
  verdict bloom replaces it at result. Don't touch sheet dim (~1404) or root colours. Style v2.
- **Discipline:** bump `x-rev` meta every checkit.html edit + verify on device (iOS restores stale
  tabs); engine-check computed styles before pushing; owner's iPhone is the only final verdict.

## 2026-07-11 — comps split: website + admin boards
- **Two boards now:** `comps/WEBSITE_COMPS.dc.html` (the site, renamed from `NEW_CHECK_COMPS.dc.html`,
  rename landed) + `comps/ADMIN_COMPS.dc.html` (the admin, in the site's skin). **ONE style guide + ONE
  copy guide cover both.** All live references updated; old names archived.
- **⚖️ STANDING RULE (owner):** every NEW admin feature gets comped in `ADMIN_COMPS.dc.html` FIRST, then
  built. Same for the site + `WEBSITE_COMPS.dc.html`. No UI ships without its comp.
- **Admin grammar (on the board):** five page types — LIVE · REPORT · LOG · CRUD · CONSOLE — and one
  report grammar (range · hero · wells · one list · footnote). Build an admin section by picking a page
  type, not inventing a layout.
- **⚠️ Missing doc:** `docs/design/copy/COPY_STYLE_GUIDE_ADMIN.md` was requested as the admin copy
  authority but doesn't exist — admin copy follows `COPY_STYLE_GUIDE.md` until Copy writes it.

## Owner design decisions (final — reconciled into STYLE_GUIDE)
- Footer = **Terms + Privacy as two separate links, no "Legal"** · **login = phone number only** ·
  mode-tab active icons ride the **accent, not green** (§5.1) · calendar selected day = **green** (§5.10)
  · footer = one centered cluster (§5.14) · plans = perk-icons + **muted-yellow tier ring** · sheets =
  grabber, **no corner ×**. Copy authority = `COPY_STYLE_GUIDE.md` (wins over any wording in a comp).

## Design knowledge worth keeping (written nowhere else)
- **iOS 26 Safari tints BOTH chrome edges (status strip + bottom plate) from the ROOT element's
  `background-color`** — it ignores `theme-color` and never samples page pixels; top ≠ bottom is
  impossible in browser. Final design = **"middle bloom"**: root stays `#0C0C12` in browser and the
  verdict wash blooms mid-page; STANDALONE keeps the to-the-top tint via a `display-mode:standalone`
  block. **Never re-add a `theme-color` meta.** Header is `position:static`; footer transparent +
  borderless — don't reintroduce sticky slabs or footer borders.

## Open
- **Store-row logo fallback (site bug):** some rows render a broken-image placeholder instead of the
  embossed 2-letter initials tile — fix in `public/checkit.html` store-row render.
- **Email template renders plain-text** in the owner's inbox (cross-lane with Website; UNRESOLVED).
- **Promote to prod** the tint/bloom + design work when the owner says go (staging-first).
- **Comp-copy scope — owner never chose:** (a) guide-as-authority / (b) rewrite comp copy / (c) rebuild
  the comp. Defaulted to (a).

## 🪤 Traps
Moved to the **`known-problems`** skill (`.claude/skills/known-problems/`) — the `?skin=v2` gate is DEAD
(v2 is the unconditional render now; any "review with ?skin=v2" note is historical), the Playwright→
staging TLS-reset workaround, stale PWA / `x-rev` deploy fingerprint, and the `ctlv2` second render
path for the result timeline. Full detail there + `docs/shared/GOTCHAS.md`.
