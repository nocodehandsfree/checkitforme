# Gotchas — hard-won facts, so we stop rediscovering them

Non-obvious traps that cost real time. Add one the moment you learn it; delete one if it stops being true.
(Pairs with the **doc-lint** habit: before a big push, skim the docs against the code — a comment that lies is
worse than no comment. Several entries below started as wrong comments.)

## Database
- **Never delete-replace a table with FK children.** `call_results.categoryId` + `.retailerId` are
  `ON DELETE CASCADE`; `retailers.chainId` is `ON DELETE SET NULL`. Deleting `categories`/`retailers` **wipes
  call history**; deleting `chains` **orphans every store from its logo + mapping.** Use **upsert, never delete**,
  and snapshot the volume first. (This wiped prod call history once.)
- **ONE environment now — there is no staging.** One prod DB: a single SQLite file on the Railway volume
  (`file:/data/local.db`). Everything (code + data) lives in prod; the old staging branch/URL/env was retired.
  If a doc still says "prod→staging" data flow or "staging→prod" code flow, it's stale — delete it on sight.
- **Prod volume has daily+weekly backups** (it had none). Volume `voice-caller-volume`, instance `ca3bbe06-…`.
  Snapshot before any destructive DB op — that's the only safety net now.

## Calls / ElevenLabs
- **ElevenLabs keeps every conversation** (`GET /v1/convai/conversations`). Call history is reconstructable from
  EL even if the DB is wiped — see `/api/admin/restore-calls-from-el`.
- **Per-call voice override is ignored** unless the agent allows it: `platform_settings.overrides.
  conversation_config_override.tts.voice_id = true` (set via EL API/dashboard).
- **Live call status was inferred, not real.** Truth now comes from Twilio `statusCallback` → `callProgress` on
  `/pub/bridge/:room` (`initiated→ringing→answered→in-progress→completed`). Don't advance the UI past "ringing"
  until `in-progress`.
- **Dead air makes clerks hang up.** Use eager turn-taking + a soft-timeout filler so a slow turn says "I'm here!"
  instead of going silent.
- **ABC / connect-on-human is a DB setting, not code — and a DB wipe silently turns it OFF.** `policy.flags.
  connectOnHuman` (the cost lever — keep ElevenLabs/Charlie asleep through the tree+hold, wake only on the human)
  defaults to `false` in code (`policy.ts`); the live value lives in the `policy_json` DB setting. The 2026-06 prod
  wipe reset it to the code default → Charlie silently billed the **whole** call again (real data: avg 64s = 46s nav
  **billed** + 28s talk). Same for `bail.enabled`. **Check `GET /api/policy` after ANY DB restore**; expected prod =
  `connectOnHuman:true, bail.enabled:true`. The calculator's "Hybrid $0.07/min · running today" line is the benchmark
  this must match.
- **Mapping's learned time-to-human (`chains.avgTreeSeconds`) is NOT yet wired into live calls.** `buildRestockVars`
  returns `dtmf/say/maxTalk` but not the timer, so ABC opens via a VAD **guess**, not the exact mapped second. Wiring
  `connectAtSec = avgTreeSeconds` through `buildRestockVars`→`placeBridgeCall` makes voice-tree chains (CVS) open
  deterministically. Until then, mapping the time-to-human doesn't pay off on the call itself.

## Frontend (checkit.html)
- **iOS Safari only applies `<meta theme-color>` at PAGE LOAD** — a later JS change is ignored. The status-bar
  tint must be **baked into the served HTML** (server `?tone=` → `renderRunner`, `server.ts`). Also needs the
  device's "Allow Website Tinting" ON (default on).
- **PWA status bar is a different mechanism** — `apple-mobile-web-app-status-bar-style: black-translucent` +
  `viewport-fit=cover` (the body paints *under* the bar). That's why "Add to Home Screen" tints when web doesn't.

## Infra / branches
- **GitHub defaults to `main` = the card app (dead for us).** voice-caller lives on the ONE branch
  `claude/retail-stock-voice-calls-OcyMS`. Watch for committing to the wrong branch (it happened repeatedly).
- **`config.staging` is vestigial but still load-bearing — do NOT delete it.** Staging as an *environment* is
  gone (no branch/URL/env), but the CODE still branches on `config.staging.on` in ~20 spots (`server.ts`,
  `auth.ts`, `staging-sim.ts`). In prod `.on` is always `false`, so those paths are dead — but if you remove
  `config.staging` from `config.ts` the prod typecheck breaks. Stripping the staging code is a separate,
  deliberate refactor, not a doc-cleanup drive-by. Until then: leave the `config.staging` scaffold alone.
- **Logos:** the Cloudflare token lacks R2-admin and the S3 keys are object-scoped to `fungibles-cards`, so logos
  serve via the `fungibles-logos` Worker on `logos.fungibles.com` (chain-logos/ prefix), not a public R2 bucket.
