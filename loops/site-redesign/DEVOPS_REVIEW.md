# DevOps overnight review — READ THIS FIRST, EVERY CYCLE (Website lane)

DevOps re-checks the redesign with EYES (rendered screenshots vs the comp board) roughly every
30 minutes all night. Open findings below OUTRANK the manifest order — address the top open finding
before taking new manifest items. When you fix one: mark it `✅ FIXED <cycle/commit>` with one line
of proof (which render you looked at). Never delete findings; history stays.

## How to use your eyes (mandatory before checking off any view)
1. `./node_modules/.bin/tsx scripts/render-comps.ts board` — renders the ENTIRE master board to
   `loops/site-redesign/render/board-*.png`. **The board was a BLACK PAGE in this sandbox until
   2026-07-02** (CDN React is blocked here; DevOps vendored it in `docs/design/vendor/`). If you
   never SAW the comps, you were painting blind — that's how round 1 failed.
2. Serve the site locally (`PORT=8787 STAGING=1 DATABASE_URL=file:./eyes.db SESSION_SECRET=<32+ chars>
   ADMIN_TOKEN=x ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test ELEVENLABS_PHONE_NUMBER_ID=test
   tsx src/server.ts`) and render your view: `tsx scripts/render-comps.ts url
   "http://127.0.0.1:8787/pokemon?skin=v2&show=mychecks" mychecks`.
3. OPEN both PNGs and compare element by element. Structure must match the comp — sections,
   hierarchy, components, order. Tokens matching ≠ done (PAINT IS NOT DONE, LOOP.md).

## OPEN findings
- [ ] **(P0) My checks (6e–6i) is old bones with new paint.** DevOps render 2026-07-02: the live
  `?skin=v2&show=mychecks` view bears no structural resemblance to comps 6e (overview) / 6f
  (activity) / 6g (earn) / 6h (new user) / 6i (history). Rebuild to the comp structure.
- [ ] **(P0) Result page (6M) doesn't match the comp.** Comp 6M: verdict wash + `RESULT` chip +
  solid verdict title + "CHECK ANOTHER STORE" ring CTA + step timeline. Owner saw old bones on a
  real call. Rebuild to 6M (and its in-stock / poll variants P6/P6b/IS1).
- [ ] **(P1) Every other view: re-verify with renders, not memory.** Round-1 sweeps compared
  tokens, not structure. Walk the board nav (S2, T1, P1, P2, 6m, L1a–c, P3a–P5, P6/P6b/IS1,
  R1–R3, SC1–2, RN1–2, 6a–6d, 6e–6i) and reopen any view whose bones differ from its comp.

## Verified OK so far (DevOps eyes)
- **Home (P1)** — close structural match on 2026-07-02 render (hero, carved search, Retail/Kiosk
  track, footer). Re-verify against P2 store-picked state when rebuilt views land.

## DevOps cycle log
- 2026-07-02 ~11:00 — Tool + review pipeline created. Board renders (20,237px, 0 errors) after
  React vendoring. Initial verdicts above from home/signup/mychecks renders vs board slices 0–7.
