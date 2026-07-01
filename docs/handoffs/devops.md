# Check — DevOps (backend, infra, security)

You are **Check - DevOps.** You own the backend core, infrastructure, security, deploys, and the
API contract. You unblock the other lanes.

## Your lane
- `src/**` core: `auth.ts`, `billing.ts`, `calls/`, `voice/` (infra side), `db/`, `redis.ts`,
  `policy.ts`, `security-checks.ts`, `server.ts` (the routing/bootstrap), `brevo.ts`, `stock/`.
- Railway env/services, Cloudflare (DNS/worker/WAF), CI, the deploy (**push to the one branch → Railway
  auto-deploys ~3 min**).
- `docs/API_CONTRACT.md` is yours to evolve (announce shape changes to Website/Admin).

## ⚠️ ONE BRANCH (see HANDOFF.md)
`claude/retail-stock-voice-calls-OcyMS` → checkitforme.com + admin.checkitforme.com. `git checkout` it +
`git pull` first thing. No staging split; no live customers yet — build live, test by calling the **Fun**
store from Admin → Testing. Data lives in the prod SQLite volume (Railway); it's been wiped before, so
**check `GET /api/policy` after any DB event** (`connectOnHuman:true, bail.enabled:true` expected).

## Access (ask owner for `RAILWAY_API_TOKEN` first)
Railway GraphQL (`backboard.railway.app/graphql/v2`) reads/writes env vars — project `889e332c…`, env
`7cbf9327…`, services: **api** `03d5f34f…` (holds CLOUDFLARE_API_TOKEN, the leaked GITHUB_PAT, GEMINI…),
**voice-caller** `d363a982…` (holds `ADMIN_TOKEN` + EL keys). Admin API is gated by header
`x-admin-token: <ADMIN_TOKEN>`. Policy: `GET/PATCH /api/policy`. Statuses: `/api/statuses`.

## Current state (2026-07-01 — KEEP UPDATED)
- [x] **Consolidated to ONE branch.** staging + copy branches merged into prod & retired; HANDOFF.md rewritten.
- [x] **ABC (connect-on-human) restored** — `policy.flags.connectOnHuman` + `bail.enabled` re-enabled in prod
  (a DB wipe had reset them to code defaults; that's the whole cost lever — Charlie only bills the human).
- [x] **Status system live** — 13 statuses, final copy EN+ES, `{store}/{product}/{category}` tokens wired
  (`fillP` in checkit.html); verdict flicker fix + "completed ≠ nobody_answered" + faster verdict (skip 2nd-read
  LLM when EL is decisive) + direct-call step log fix. Registry filled in prod.
- [x] **Docs 51→21.** Deletions recoverable from git history.
- [ ] **ROI win — wire ABC's exact-second open.** `chains.avgTreeSeconds` (learned time-to-human, 43 chains
  have it) is NOT passed into the live call — ABC opens via VAD *guess*. Thread `connectAtSec = avgTreeSeconds`
  through `buildRestockVars`→`placeBridgeCall` so voice-tree chains (CVS) open deterministically.
- [ ] **Kill "Call failed" → real reasons.** voicemail/busy/bad_number exist in the registry but `mapStatus`
  never produces them (collapses to failed/no_answer). Map EL `termination_reason` → those, then drop "failed".
- [ ] **Transcript echo** — bridge feeds some agent audio back as clerk input, corrupting extraction. Fix at bridge.
- [ ] **Real-store launch** — when it begins, press **Start fresh** (Pulse → Stats baseline, `stats_since`) so only
  post-launch calls count; then resume mapping (chains recipe/avgTreeSeconds).
- [ ] **Branch pile** — ~35 stale branches linger on GitHub; **this env can't delete refs** (git proxy 403s
  `--delete` and ignores PATs; owner deletes via the GitHub Branches UI — keep only OcyMS/main/keen-edison-3mmWu/
  test-coverage/test-coverage-loop-7cojsl). HANDOFF.md tells everyone to ignore the rest, so it's cosmetic.
- [ ] **Secrets** — rotate the leaked `GITHUB_PAT`; `GITHUB_OPS_OAT` is unused (env routes GitHub via Claude's App,
  not PATs).

Update this list when you finish something. See `docs/GOTCHAS.md` for the traps that cost us hours.
