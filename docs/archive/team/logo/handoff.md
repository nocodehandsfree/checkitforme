# Logo lane — handoff (stable; how this lane works)

**I am Logo.** My only job: every store logo looks GOOD and renders well at the true
tile size. The bar is `checkitforme.com/logo-wall` — uniform real brand marks,
transparent, filling the tile, readable on the dark grey. Anything I ship is
indistinguishable from that wall.

## Boot (every session)
1. `git checkout staging && git pull --rebase` (this lane's session branch merges to staging;
   the current infra branch is `claude/logo-asset-lane-setup-8rx7ep`).
2. Read TOP TO BOTTOM: `docs/data/store-logos.md` (system + pipeline, my bible) →
   `public/logos/chains/README.md` (the 8 asset rules + new-store steps) →
   `public/logos/chains/STATUS.md` (what's locked / in progress / todo).
3. Read `docs/team/logo/checkpoint.md` for current state.
4. Reply 3 bullets (focus · blockers · offer to continue) and wait for the owner's list.

## What I own vs. what I DON'T
- **I change ASSET FILES only:** `public/logos/chains/<slug>.png` + `_meta.json`.
- I do **not** touch render code. If a surface renders a logo wrong (sizing, plate,
  wide-flag handling), that's Webbie (consumer) / Addie (admin) — file it, don't fix it here.
- I do **not** edit store data / slugs. Slug won't resolve → ask Data Dev.

## The system (how a logo reaches a screen)
- Asset = `public/logos/chains/<slug>.png`; flags = `_meta.json` `{ "w":0|1, "d":0|1 }`
  (`w:1` wide wordmark → 44×34 box; `d:1` needs a light plate — rare).
- `chainLogoInfo(name)` in `src/server.ts` maps name → `{url,wide,dark}`. **DB-first:**
  a chain row's `logo_url` (shared R2) wins; the file is the fallback + source of truth.
- Cache-bust lives in `chainLogoInfo`: `/logos/chains/${f}?v=N` (currently **v=73**).
  **Bump N whenever any asset changes** or browsers/CDN serve the stale image.
- 100K+ store rows reference these chains by name — I only ever touch the ~97 asset files.

## The pipeline (owner-approved — do NOT reinvent; details in store-logos.md §6)
Work in a scratch dir, copy only the final PNG into the repo.
1. **Source the REAL mark** — never a font fake:
   - App icon: `curl "https://itunes.apple.com/search?term=<brand>&entity=software&limit=1"`
     → `results[0].artworkUrl512`.
   - Wikimedia vector: `curl -sL -o m.svg "https://commons.wikimedia.org/wiki/Special:FilePath/<Exact_File.svg>"`
     (robust — resolves the hashed path; don't guess `upload.wikimedia.org` URLs, they 404).
   - Owner-supplied file (read off disk).
   - **App-icon caveat:** if the icon is a wordmark on a **colored box** (Best Buy = white text
     on blue), flood-fill can't strip it → use the **vector mark** instead. Mark-only wins.
2. **Treatment** — mark-only if the brand has an icon; drop taglines; long mark-less names →
   real lettering on two balanced lines; keep brand color, lighten if too dark on grey.
3. **Strip white → transparent** (the reusable `process.mjs` in scratch does this):
   - `--mode=flood` removes OUTER white only (flood-fill from borders) — keeps white letter holes.
   - `--mode=global` removes ALL near-white (colored wordmarks with white inside the counters).
   - White is stripped from PIXELS. NEVER "fix" white in CSS — that's not a thing.
4. **Trim** to alpha bbox, add clip-safe margin, **normalize** onto the standard envelope so
   every mark renders the same size.
5. **Ship:** save `<slug>.png` → set/confirm `_meta.json` (`w:1` when ink aspect ≥ ~1.5) →
   **bump `?v=` in `chainLogoInfo`** → push → **QA on `/logo-wall` at true 52px**, not a zoom.

## Scratch tooling (rebuild each session — not committed)
No image tooling is pre-installed. In a scratch dir:
```
npm init -y && npm i sharp     # sharp 0.35.x installs clean on node 22
```
`process.mjs` (flood/global strip + trim + normalize + suggests the wide-flag) lives in scratch;
re-create it from store-logos.md §6 if the scratch dir is gone. QA by compositing the PNG onto a
`#191920` tile at 42px inside a 52px square and viewing it — that IS the wall.

## Workflow with the owner (from STATUS.md — obey)
- Process in **chunks of 10, alphabetical**. Fix a chunk → send ONE contact sheet at the real
  phone size → owner approves → **lock it**. Never re-touch a locked logo.
- **Contact sheets show ONLY the chunk under review.** Never include locked logos as
  "comparison" tiles — the owner reads everything on a sheet as new work and it breaks trust.
  Compare against locked neighbors privately; send him just the new ones, labeled.
- Note: a repo file can differ from live (`logos.fungibles.com/chain-logos/<slug>.png` — R2
  wins at render). Before judging or re-working ANY existing logo, diff repo vs R2 first
  (walmart.png differs today: repo has a newer un-migrated rework).
- **NO global/universal normalize passes** — they silently regressed approved logos. Per-logo only.
- Legend in STATUS.md: ✅ locked · 🔧 in progress · ⬜ todo (needs owner image).

## Picking up a half-done batch cold (next agent: start HERE)
1. Boot (above). Open STATUS.md — the **first `🔧` or `⬜` chunk** is the live work.
2. `⬜` rows = "needs owner image" (Metro Market, Pak 'n Save, Payless Foods, Unique, and any in
   the New-stores list). Don't invent these — ask the owner for the file.
3. For each unfinished logo in the batch: run the pipeline above, drop the PNG in
   `public/logos/chains/`, update its `_meta.json` flag, and set its STATUS row to what you did.
4. Bump `?v=` in `chainLogoInfo` (one bump covers the whole batch), push to the branch, and
   build a contact sheet of the batch at true 52px. Owner approves → mark the chunk ✅ LOCKED.
5. If a slug won't resolve → Data Dev. If a surface renders it wrong → Webbie/Addie. Never both
   fix the file AND the render code.
