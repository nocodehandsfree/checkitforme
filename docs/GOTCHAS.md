# Gotchas — hard-won facts, so we stop rediscovering them

Non-obvious traps that cost real time. Add one the moment you learn it; delete one if it stops being true.
(Pairs with the **doc-lint** habit: before a big push, skim the docs against the code — a comment that lies is
worse than no comment. Several entries below started as wrong comments.)

## Database
- **Never delete-replace a table with FK children.** `call_results.categoryId` + `.retailerId` are
  `ON DELETE CASCADE`; `retailers.chainId` is `ON DELETE SET NULL`. Deleting `categories`/`retailers` **wipes
  call history**; deleting `chains` **orphans every store from its logo + mapping.** Use **upsert, never delete**,
  and snapshot the volume first. (This wiped prod call history once.)
- **Prod & staging are SEPARATE databases** — each its own SQLite file on its own Railway volume
  (`file:/data/local.db`). Editing config in the prod Admin does NOT appear on staging. **Data flows prod→staging
  only** (`table-dump`→`table-load`, staging-only); code flows staging→prod via branches. No staging→prod data write.
- **Prod volume has daily+weekly backups now** (it had none). Volume `voice-caller-volume`, instance `ca3bbe06-…`.

## Calls / ElevenLabs
- **ElevenLabs keeps every conversation** (`GET /v1/convai/conversations`). Call history is reconstructable from
  EL even if the DB is wiped — see `/api/admin/restore-calls-from-el`.
- **Per-call voice override is ignored** unless the agent allows it: `platform_settings.overrides.
  conversation_config_override.tts.voice_id = true` (set via EL API/dashboard).
- **Agent voices drift between envs.** Staging vs prod use *different* restock agents — set the voice on each.
- **Live call status was inferred, not real.** Truth now comes from Twilio `statusCallback` → `callProgress` on
  `/pub/bridge/:room` (`initiated→ringing→answered→in-progress→completed`). Don't advance the UI past "ringing"
  until `in-progress`.
- **Dead air makes clerks hang up.** Use eager turn-taking + a soft-timeout filler so a slow turn says "I'm here!"
  instead of going silent.

## Frontend (checkit.html)
- **iOS Safari only applies `<meta theme-color>` at PAGE LOAD** — a later JS change is ignored. The status-bar
  tint must be **baked into the served HTML** (server `?tone=` → `renderRunner`, `server.ts`). Also needs the
  device's "Allow Website Tinting" ON (default on).
- **PWA status bar is a different mechanism** — `apple-mobile-web-app-status-bar-style: black-translucent` +
  `viewport-fit=cover` (the body paints *under* the bar). That's why "Add to Home Screen" tints when web doesn't.

## Infra / branches
- **GitHub defaults to `main` = the card app (dead for us).** voice-caller lives on the staging/prod branches only.
  Watch for committing to the wrong branch (it happened repeatedly).
- **`config.staging` must exist in `config.ts`** or prod typecheck breaks (`server.ts` references it).
- **Logos:** the Cloudflare token lacks R2-admin and the S3 keys are object-scoped to `fungibles-cards`, so logos
  serve via the `fungibles-logos` Worker on `logos.fungibles.com` (chain-logos/ prefix), not a public R2 bucket.
