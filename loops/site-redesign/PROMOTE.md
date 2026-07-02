# PROMOTE RUNBOOK — redesign → production (owner-triggered; the loop never promotes on its own)

Two distinct moves. Do A first; B is its own decision later.

## A. Promote the CODE to prod (safe any time — prod users see ZERO change)
The v2 skin only activates via `?skin=v2` (localStorage `cifm_skin`); the default render is untouched
(re-proven: `proofs/v1-unchanged.png` + the v1-invariant checks in qa-e2e). So a normal staging→prod
merge ships everything dormant, PLUS the always-on wins riding this branch:
- **Self-hosted Inter** (`/fonts/` route + head swap) — fixes the system-font fallback for BOTH skins
  on ad-blocked networks. This alone is worth promoting early.
- The `cs.cta` i18n fix (English CTA in Spanish — pre-v2 bug, both skins).
- June history/calendar fixes the owner is waiting on for prod.

Steps:
1. `git checkout claude/retail-stock-voice-calls-OcyMS && git pull`
2. `git merge origin/claude/checkitforme-website-takeover-pagiis` (resolve nothing blindly; staging is ahead)
3. `git push -u origin claude/retail-stock-voice-calls-OcyMS` → Railway auto-deploys checkitforme.com
4. Post-verify on PROD: `curl -s https://checkitforme.com/fonts/inter-var-latin.woff2 -o /dev/null -w "%{http_code}"`
   → 200 · served HTML has no `fonts.googleapis` · `/pokemon` renders v1 look · `?skin=v2` renders the
   new look (owner-only preview on prod) · **June calendar nav works** (the owner's open prod bug).
5. Owner previews v2 ON PROD via `checkitforme.com/pokemon?skin=v2` with real calls.

## B. THE TAKEOVER — make v2 the default look (owner's explicit call only)
1. In `public/checkit.html` boot script (~line 23-40):
   - Make the skin unconditional: replace the localStorage gate with
     `document.documentElement.setAttribute('data-skin','v2')` (keep `?skin=off` as a session escape
     hatch during the first days if desired).
   - **DELETE the preview badge block** (the `NEW LOOK · preview` injection, ~lines 33-40).
2. Decide the hidden pages separately — they have their OWN gates and stay hidden through the takeover:
   - Hobby (`?flow=hobby` + isV2) · sign-up previews (`?show=…`) — expose each only when its lane is
     ready (hobby: owner call; YOUR HUNT still blocked on the price backend).
3. Copy: ratify the COPY QUEUE first (comp-copy rulings + 58 draft ES strings) — the takeover ships
   that copy to everyone.
4. Later cleanup (separate PR, no rush): fold `/*V2*/` CSS into the base sheet and drop dead v1 rules.

## Standing guards that ride along
qa-e2e (43 rendered checks incl. font-load + v1-invariant + per-brand accents) · qa-pages (66) ·
qa-design (7) — run `bash scripts/test-all.sh` before any promote push; all must be green.
