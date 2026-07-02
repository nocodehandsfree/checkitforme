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
- [~] **(P0) My checks (6e–6i)** — partially confirmed rebuilt (DevOps cycle 1 render, commit
  de68845): the EMPTY state is genuinely in the new structure (empty card + raised calendar +
  ring CTA). The POPULATED structure (history rows, 6f activity, 6g earn, 6i history) is
  unverified — DevOps seeds local data next cycle and re-renders. Leave open until then.
- ✅ **FIXED (P0) Result page (6M)** — CONFIRMED REBUILT by DevOps eyes, cycle 1 (commit ec82224,
  render c1-result vs comp 6M): verdict wash ✓ RESULT chip ✓ solid verdict title ✓ CHECK ANOTHER
  STORE ring CTA ✓ step timeline with colored progression ✓ STAFF/CHECK-AI conversation bubbles ✓
  restock module ✓ "1 check used" ✓. Still verify: in-stock (P6), poll (P6b), IS1 variants —
  DevOps renders sim_..._in / _maybe next cycle.
- [ ] **(P1) Every other view: re-verify with renders, not memory.** Round-1 sweeps compared
  tokens, not structure. Walk the board nav (S2, T1, P1, P2, 6m, L1a–c, P3a–P5, P6/P6b/IS1,
  R1–R3, SC1–2, RN1–2, 6a–6d, 6e–6i) and reopen any view whose bones differ from its comp.

## Verified OK so far (DevOps eyes)
- **Home (P1)** — close structural match on 2026-07-02 render (hero, carved search, Retail/Kiosk
  track, footer). Re-verify against P2 store-picked state when rebuilt views land.

## DevOps cycle log
- 2026-07-02 ~12:30 CYCLE 2 (catch-up — DevOps loop was DOWN ~11:41-12:11, session scheduler reset;
  re-armed with self-check). Seeded 3 call rows locally. VERDICTS: P6 in-stock result CONFIRMED
  REBUILT (green wash, RESULT chip, ring CTA, timeline, conversation, IS1 Share/Driver rows,
  '1 check used' — render c2-result-instock). 6M variant family now 2/3 confirmed (_maybe/poll P6b
  pending). Populated 6i history LIST still unverified — ?show=mychecks auto-restores the latest
  result instead of staying on the list; next cycle renders the list state directly. Website loop
  cadence healthy (~8 min/commit, screenshot proofs in commits).
- 2026-07-02 ~11:20 CYCLE 1 — 6M result: CONFIRMED structural rebuild (see above). 6e My-checks:
  empty state confirmed; populated structure pending seeded data. Render tool now supports
  signed-in renders (CIFM_TOKEN env → cifm_token localStorage). Next cycle: seed eyes.db
  call_results, render 6M variants (_in/_maybe), populated 6e-6i, and the 6a upsell claim.
- 2026-07-02 ~11:00 — Tool + review pipeline created. Board renders (20,237px, 0 errors) after
  React vendoring. Initial verdicts above from home/signup/mychecks renders vs board slices 0–7.
