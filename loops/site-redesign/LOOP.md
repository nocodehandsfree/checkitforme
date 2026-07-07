# Site-redesign overnight loop — protocol (Website lane)

Autonomous overnight implementation of the new design across the ENTIRE consumer site
(`public/checkit.html`, all views/brands/languages). State lives in THIS folder, never in the
agent's memory — any fresh session resumes by reading `MANIFEST.md` and continuing.

## Rules (non-negotiable)
- **PAINT IS NOT DONE (owner, 2026-07-02).** Re-skinning an existing screen with new tokens is NOT
  implementing the design. Every view with a comp must be REBUILT to the comp's conceptual
  STRUCTURE — its sections, hierarchy, components, and layout — as rendered in
  `docs/design/comps/NEW_CHECK_COMPS.html`. Audit sweeps must compare each view against its comp
  ELEMENT BY ELEMENT (open the comp, open the page, walk them side by side) — a view whose bones
  differ from the comp is REOPENED even if every token matches. Token conformance (`qa-design.ts`)
  is the floor, never the definition of done.
- **Never stop to ask.** Ambiguous → implement the best design-system-conforming option, note it in
  the manifest (`DECIDED: <what>`); truly impossible (missing comp/asset) → mark `BLOCKED: <reason>`
  and MOVE ON. The owner reviews decisions + blockers in the morning.
- **Preview mode first.** All redesign renders behind the agreed PREVIEW switch so the current
  staging site stays intact for morning testing. Build the switch in cycle 1 if it doesn't exist.
- **Website lane only**: `public/checkit.html` + assets. No `/api`, no backend, no other lanes.
- **Design truth**: the comps in `docs/design/` + `docs/design/STYLE_GUIDE.md` +
  `docs/design/brand/BRAND.md` + `docs/design/copy/COPY_STYLE_GUIDE.md`. Never invent
  colors/type/spacing/copy.
- **Every cycle: `npx tsc --noEmit` + `bash scripts/test-all.sh` green → commit → push.** Small
  commits. A cycle that doesn't push didn't happen. (test-all will include the design-token harness
  — `scripts/qa-design.ts`, DevOps builds it from the new style guide's tokens — which fails on any
  off-system color/size/spacing and on banned/invented terms. Fix harness failures IN the cycle.)

## Copy rule — comp copy is PLACEHOLDER, never truth
Claude Design invents terms. For every text string: keep the existing approved copy (copy docs +
the live site + the statuses registry are truth). Comp copy that exists nowhere approved →
implement the layout with the approved/existing text and log the comp's wording under
`## COPY QUEUE` in MANIFEST.md (view · element · comp copy · current copy). The Copy lane
processes that queue + a full-site voice pass; Website applies what Copy approves. Never ship
invented copy.

## The loop
Start EVERY cycle with `git pull --no-rebase`, then **read `DEVOPS_REVIEW.md` in this folder —
DevOps re-checks your work with rendered screenshots all night, and its OPEN findings outrank the
manifest order.** Use your EYES per that doc: render the comp board + your view with
`scripts/render-comps.ts` and LOOK at both PNGs before checking anything off.
0a. **Cycle 0a (once, BEFORE any redesign change) — the behavior benchmark:** write
   `scripts/qa-pages.ts`: fetch every brand page + main view from the local served site, assert HTTP
   200 + the critical behavior markers (search, check button, live call view, results rail, history,
   ES toggle). Add to `test-all.sh`. This captures HOW THE SITE WORKS NOW; it must stay green all
   night — the redesign changes look and copy, never behavior.
0b. **Cycle 0b (once):** build `scripts/qa-design.ts` from `STYLE_GUIDE.md`'s exact tokens:
   fail on any color/font-size/spacing outside the new system (within preview-mode markup) + banned
   terms (see Terminology in the root CLAUDE.md) + COPY-QUEUE invented terms leaking into the page.
   Add to `test-all.sh`.
0. **Cycle 0 (once):** enumerate EVERY view/section/element/copy-string **from the LIVE SITE**
   (`checkit.html` — all views, brands, languages, error/empty states) into `MANIFEST.md` as
   unchecked boxes, grouped by page. THEN map comps onto that list. A view with no comp is marked
   `NO COMP` and gets restyled by EXTENDING the system (existing components + style-guide rules) —
   never skipped. The site defines the work; the comps only inform it. Commit.
1. Read `MANIFEST.md` → take the first unchecked item (or the first re-opened one).
2. Implement it to match the design exactly. Verify rendered output (serve locally or check the
   served staging HTML after push).
3. Check it off with a one-line note. tsc + tests → commit + push.
4. Repeat. Manifest 100% checked → **AUDIT SWEEP**: walk every page fresh against the design docs;
   anything off → re-open its box with `REOPENED: <why>`. A sweep is logged at the bottom of
   MANIFEST.md with its fix count.
5. ~~Exit on two clean sweeps~~ **OWNER OVERRIDE 2026-07-02: the loop NEVER self-exits this round.**
   Sweeps repeat with rotating lenses (comp fidelity via screenshots · behavior paths · type · copy ·
   ES · spacing) until the OWNER stops the loop. Two clean sweeps only gates writing a status report. Then write the morning report at
   the top of MANIFEST.md: done / decided / blocked, and update `docs/team/website/handoff.md`.
6. **After exit, loop firings are no-ops:** if MANIFEST.md already shows the exit condition met,
   reply exactly `LOOP COMPLETE` and do nothing. (The owner stops the /loop in the morning.)

## Morning (owner)
1. Stop the /loop → read the report at the top of MANIFEST.md.
2. **Independent QA (separate chat, read-only):** QA walks the PREVIEW on staging.checkitforme.com
   page by page against STYLE_GUIDE + brand + copy docs + this manifest — judging the RENDERED site,
   never trusting Website's checkboxes. Output: findings list (page · element · which rule it violates).
3. Owner triages QA findings + preview walk → accepted items become new unchecked manifest boxes →
   re-run the same kickoff to burn them down. Repeat until QA comes back clean.
