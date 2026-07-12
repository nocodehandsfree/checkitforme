# Check - Design — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

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
