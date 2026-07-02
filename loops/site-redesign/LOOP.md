# Site-redesign overnight loop — protocol (Website lane)

Autonomous overnight implementation of the new design across the ENTIRE consumer site
(`public/checkit.html`, all views/brands/languages). State lives in THIS folder, never in the
agent's memory — any fresh session resumes by reading `MANIFEST.md` and continuing.

## Rules (non-negotiable)
- **Never stop to ask.** Ambiguous → implement the best design-system-conforming option, note it in
  the manifest (`DECIDED: <what>`); truly impossible (missing comp/asset) → mark `BLOCKED: <reason>`
  and MOVE ON. The owner reviews decisions + blockers in the morning.
- **Preview mode first.** All redesign renders behind the agreed PREVIEW switch so the current
  staging site stays intact for morning testing. Build the switch in cycle 1 if it doesn't exist.
- **Website lane only**: `public/checkit.html` + assets. No `/api`, no backend, no other lanes.
- **Design truth**: the comps in `docs/design/` + `docs/design/STYLE_GUIDE.md` +
  `docs/brand/CHECK_BRAND_STYLE_GUIDE.md` + `docs/business/COPY_STYLE_GUIDE.md`. Never invent
  colors/type/spacing/copy.
- **Every cycle: `npx tsc --noEmit` + `bash scripts/test-all.sh` green → commit → push.** Small
  commits. A cycle that doesn't push didn't happen.

## The loop
0. **Cycle 0 (once):** enumerate EVERY view/section/element/copy-string of the site into
   `MANIFEST.md` as unchecked boxes, grouped by page. Map each to its comp. Commit.
1. Read `MANIFEST.md` → take the first unchecked item (or the first re-opened one).
2. Implement it to match the design exactly. Verify rendered output (serve locally or check the
   served staging HTML after push).
3. Check it off with a one-line note. tsc + tests → commit + push.
4. Repeat. Manifest 100% checked → **AUDIT SWEEP**: walk every page fresh against the design docs;
   anything off → re-open its box with `REOPENED: <why>`. A sweep is logged at the bottom of
   MANIFEST.md with its fix count.
5. **Exit only when two consecutive audit sweeps log ZERO fixes.** Then write the morning report at
   the top of MANIFEST.md: done / decided / blocked, and update `docs/handoffs/website.md`.
6. **After exit, loop firings are no-ops:** if MANIFEST.md already shows the exit condition met,
   reply exactly `LOOP COMPLETE` and do nothing. (The owner stops the /loop in the morning.)

## Morning (owner)
1. Stop the /loop → read the report at the top of MANIFEST.md.
2. **Independent QA (separate chat, read-only):** QA walks the PREVIEW on staging.checkitforme.com
   page by page against STYLE_GUIDE + brand + copy docs + this manifest — judging the RENDERED site,
   never trusting Website's checkboxes. Output: findings list (page · element · which rule it violates).
3. Owner triages QA findings + preview walk → accepted items become new unchecked manifest boxes →
   re-run the same kickoff to burn them down. Repeat until QA comes back clean.
