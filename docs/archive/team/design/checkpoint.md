# Check - Design — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## 2026-07-18 — QUEUED "we're slammed" holding card comped (CD)
- New check-status state: all call slots full, the check can't start yet (no transcript). A calm
  holding moment, **never an error** — no "line"/"queue" language anywhere (owner).
- Comp: `comps/QUEUED_HOLDING_CARD_COMP.dc.html` (standalone `.dc.html`). Contained in-stock green
  wash (§3) + glass chrome (§5.4); store row (§5.6) with the real chain logo; one-line headline
  "We're slammed." (§8); glass timer well "Check starts in 0:30" (accent `#FFCB05`).
- EN+ES copy, token refs, and Webbie build notes live in the comp file's header comment. The 30s
  countdown is a COMP DEMO only; real value is server-driven.
- **OPEN:** source of the 30s value + exact `0:00` → live-call view handoff; fold into
  `WEBSITE_COMPS.dc.html` on the next board regen.

## iOS sheet + glass LAWS (consolidated 07-16→07-18, all owner-verified — full story in git log + known-problems skill)
- **THE SHEET RECIPE (variant H, /sheetpeek in src/server.ts is the reference):** while a sheet is
  open: (1) dim = content filter (`filter:brightness(.45)` on main/header), NEVER a fixed rgba
  overlay — an overlay kills iOS 26's scroll-edge glass; (2) root colour stays CONSTANT in-page;
  (3) the sheet is ABSOLUTE page-layer content (not position:fixed), anchored `scrollY + 14%
  viewport`, height overshooting ~120px into the bar zone, background scroll locked. Fixed sheets
  live in the UI layer Safari never ghosts; absolute sheets are page paint → glass ghosts their rows
  under the toolbar. Rolled out on site + Admin (Admin locked by `qa-admin-glass.mjs`, 11 invariants
  in test-all — any revert fails the ship).
- **CHROME TINT PLATFORM (constraint comment at checkit.html ~310):** iOS 26 Safari tints BOTH
  chrome edges from the ROOT element's `background-color` — ignores `theme-color` (never re-add that
  meta), never samples page pixels, re-reads only at load/main-scroll → in-page recolor during
  sheets is impossible (4 attempts reverted; edge-compensation veils reverted — do NOT re-add).
  Final design = "middle bloom": root stays `#0C0C12`, verdict wash blooms mid-page; standalone
  PWA keeps full tint via a `display-mode:standalone` block. Header static; footer transparent.
- **Owner's black top during Fun-store self-answered test calls = iOS in-call UI**, not a page bug.
- **Discipline:** bump `x-rev` meta every checkit.html edit + verify on device; owner's iPhone is
  the only final verdict on chrome/tint work.

## 2026-07-11 — comps split: website + admin boards
- **Two boards:** `comps/WEBSITE_COMPS.dc.html` (site) + `comps/ADMIN_COMPS.dc.html` (admin, in the
  site's skin). ONE style guide covers both; copy = `COPY_STYLE_GUIDE.md` + `COPY_STYLE_GUIDE_ADMIN.md`.
- **⚖️ STANDING RULE (owner):** every NEW feature gets comped on its board FIRST, then built.
  No UI ships without its comp — and the build matches the comp 1:1 (CLAUDE.md LAW 3).
- **Admin grammar (on the board):** five page types — LIVE · REPORT · LOG · CRUD · CONSOLE — and one
  report grammar (range · hero · wells · one list · footnote). Build by picking a page type.

## Owner design decisions (final — reconciled into STYLE_GUIDE)
- Footer = **Terms + Privacy as two separate links, no "Legal"** · **login = phone number only** ·
  mode-tab active icons ride the **accent, not green** (§5.1) · calendar selected day = **green** (§5.10)
  · footer = one centered cluster (§5.14) · plans = perk-icons + **muted-yellow tier ring** · sheets =
  grabber, **no corner ×**. Copy authority = `COPY_STYLE_GUIDE.md` (wins over any wording in a comp).

## Open
- **Store-row logo fallback (site bug, owner flagged logos twice on 07-21):** some rows render a
  broken-image placeholder instead of the embossed 2-letter initials tile — `public/checkit.html`
  store-row render. ALSO: My Zones screens + the call-log header logo must use the SAME logo system
  as single checks (additive law) — PM driving an audit before new work.
- **Webbie (owner-approved direction):** unclip the `.rhead.live` green halo (wrapper above `#live`)
  + build the green middle-out "call in progress" bloom on the live view (copy verdict-bloom
  geometry; liveGlowV2 exists); verdict bloom replaces it at result.
- **Email template renders plain-text** in the owner's inbox (cross-lane with Website; UNRESOLVED).
- **Comp-copy scope — owner never chose:** (a) guide-as-authority / (b) rewrite comp copy / (c)
  rebuild the comp. Defaulted to (a).

## 🪤 Traps
Moved to the **`known-problems`** skill — `?skin=v2` gate is DEAD (v2 renders unconditionally),
Playwright→staging TLS-reset workaround, stale PWA / `x-rev` deploy fingerprint, `ctlv2` second
render path. Full detail there + `docs/shared/GOTCHAS.md`.
