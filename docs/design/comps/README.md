# comps/ — the visual comp (one board)

**`NEW_CHECK_COMPS.dc.html`** is the single approved design board — the **visual representation** of
the look. There is exactly one comp; the old self-contained bundle `NEW_CHECK_COMPS.html` was a
generated duplicate and now lives in `docs/archive/`.

**This board and the style guide reference each other:**
- The board shows the screens. **`../STYLE_GUIDE.md`** is the words for what the board shows — every
  token, type size, radius, and component rule, extracted 1:1 from this board.
- The board's baked-in **copy** predates the copy-style-guide pass, so on any wording conflict the
  authority is **`../copy/COPY_STYLE_GUIDE.md`**, not the board.
- Live-vs-comp screenshots (proof the shipped `?skin=v2` site matches this board):
  **`../../specs/design-gap/inventory.html`**.

**View it:** `tsx scripts/render-comps.ts board` (the `.dc.html` renders through the dc-runtime).
`vendor/` holds the pinned Inter fonts + React runtime so it renders offline.
