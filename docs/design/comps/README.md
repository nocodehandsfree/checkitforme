# comps/ — the visual comps (one active board + the inbox)

**Rebuild 2026-07-22:** the consumer site is FROZEN and its reference is the LIVE SITE itself,
snapshotted in `../truth/`. The old consumer boards (`WEBSITE_COMPS`, `MY_ZONES_COMP`,
`QUEUED_HOLDING_CARD_COMP`) are superseded → `docs/archive/`. Never resurrect them.

| What | Surface |
|---|---|
| **`ADMIN_COMPS.dc.html`** (ACTIVE) | admin.checkitforme.com (`public/app.html`) — Admin is still being built toward it. |
| **`inbox/`** | CD's MCP submissions — temporary files; see `inbox/README.md` for the flow. |
| **`../truth/`** | Snapshots of the live consumer pages — THE reference for the frozen site. |

**Never open a board whole** — `../INDEX.md` first, then the line range.
Comp ↔ live differences: `node scripts/gap-check.mjs <comp> <truth-or-url>` (before AND after building).

## ⚖️ Standing rule (owner, 2026-07-11)

**Every NEW admin feature gets comped in `ADMIN_COMPS.dc.html` FIRST, then built.** No admin UI
ships without its comp on the board. Consumer pages don't take comps while frozen — an owner-named
task + the `.unlock` flow is the only path, and the truth snapshot is re-taken after.

## The boards and the guides reference each other

- The boards show the screens. **`../STYLE_GUIDE.md`** is the words for what the boards show — every
  token, type size, radius, and component rule.
- On any wording conflict the authority is **`../copy/COPY_STYLE_GUIDE.md`**, not a board.
- The admin board also defines the admin's five page types (LIVE · REPORT · LOG · CRUD · CONSOLE)
  and the one report grammar (range · hero · wells · one list · footnote). Build new admin sections
  by picking a page type, not by inventing a layout.
- Live-vs-comp screenshots: **`../../specs/design-gap/inventory.html`**.

## View them

- `tsx scripts/render-comps.ts board` renders the website board offline (`vendor/` holds the pinned
  Inter fonts + React runtime).
- `ADMIN_COMPS.dc.html` is plain inline-styled HTML inside `<x-dc>` and also opens directly in a
  browser. Its optional `./support.js` runtime comes from the design pipeline; the board renders
  fine without it.

## Other boards

**`MY_ZONES_COMP.dc.html`** — the owner's 07-11 My Zones board (self-contained; open in a browser).
It locks the **bottom-notification pill** (thin glowing outline, gray, fragment copy — no periods or
commas) and the **zones** screens (list · basket bar · check-this-zone confirm · actions sheet). The
words for both are in **`../STYLE_GUIDE.md` §5.4 (pill) and §5.17 (zones)**. Shipped to staging
2026-07-11; fold these screens into the website board on the next board regen.

(The old self-contained bundle `NEW_CHECK_COMPS.html` stays retired in `docs/archive/`.)
