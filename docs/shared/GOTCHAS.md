# Gotchas — hard-won facts, so we stop rediscovering them

Non-obvious traps that cost real time. Add one the moment you learn it; delete one if it stops being true.
(Pairs with the **doc-lint** habit: before a big push, skim the docs against the code — a comment that lies is
worse than no comment. Several entries below started as wrong comments.)

## Design rulings
- **The call-timeline left rail is owner-approved — never remove it** (settled 2026-07-10). Addie read a
  voice note ("no indenting, everything left adjusted") as "remove the rail" and cut the whole vertical
  timeline; the owner immediately asked where it went; Webbie restored it (e34d72b). Lesson: owner feedback
  that arrives WITHOUT its screenshot describes one element, not the layout — when a design change would
  delete a whole visual structure, restyle the smallest thing that matches the words, or ask.

## Database
- **Never delete-replace a table with FK children.** `call_results.categoryId` + `.retailerId` are
  `ON DELETE CASCADE`; `retailers.chainId` is `ON DELETE SET NULL`. Deleting `categories`/`retailers` **wipes
  call history**; deleting `chains` **orphans every store from its logo + mapping.** Use **upsert, never delete**,
  and snapshot the volume first. (This wiped prod call history once.)
- **Staging and prod each have their OWN SQLite DB** (own Railway volume, `file:/data/local.db`). Code flows
  staging → prod (merge); the Admin reads live prod data. An admin-API DB write hits only the env you call.
- **Prod volume has daily+weekly backups** (it had none). Volume `voice-caller-volume`, instance `ca3bbe06-…`.
  Snapshot before any destructive DB op.

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
- **Connect-on-human is baked ALWAYS-ON in code now** (server.ts `connectOnHuman ?? true`, commit 480cacf) — no DB toggle can silently disable it anymore. But other policy flags (e.g. `bail.enabled`) still live in the `policy_json` DB setting: **check `GET /api/policy` after ANY DB restore.**
- **Store logos have an owner-approved process — follow it, don't reinvent it.** Logos are the stores' brands; the owner signs off on how they look. `checkitforme.com/logo-wall` is the ultimate source of truth — logos FEED from that page. It + `docs/data/store-logos.md` ARE the process that finally worked — new logos go through it; never invent a new sizing approach or batch-resize existing approved logos.
- **"Visual regression" = stale cache until proven otherwise.** Several "regressions" were device/SW cache (2026-07 hobby art). Hard-refresh / bump the SW cache version FIRST; reproduce fresh before touching code.
- **Every user-facing string ships with its Spanish in the SAME commit.** ES gaps were caught late ~23 times (even the primary CTA). No literal strings — through `t()` with the ES value, same commit.
- **iOS Safari only applies `<meta theme-color>` at PAGE LOAD** — a later JS change is ignored. The status-bar
  tint must be **baked into the served HTML** (server `?tone=` → `renderRunner`, `server.ts`). Also needs the
  device's "Allow Website Tinting" ON (default on).
- **PWA status bar is a different mechanism** — `apple-mobile-web-app-status-bar-style: black-translucent` +
  `viewport-fit=cover` (the body paints *under* the bar). That's why "Add to Home Screen" tints when web doesn't.

## Email rendering (the 07-15/16 Gmail loop — 7+ attempts; read before touching src/alerts.ts)
- **Outlook Windows renders with Word:** tables + inline styles only, and it GRAYS near-black —
  pure `#000000` survives, `#0C0C12` does not (437bb02 proved it).
- **Gmail is the other trap:** strips `<style>` in many contexts, drops body backgrounds unless the
  wrapper TABLE carries `bgcolor`, and dark-mode rewrites colors. A dark email showing WHITE in
  Gmail = the background was dropped, not the shade mischosen.
- Full attempt history: `git log --grep="emails"`. Verdict = the owner's phone screenshots after a
  REAL test send, one variable per iteration. Owner's requirement: the dark look, everywhere.

## Infra / branches
- **Admin traffic does NOT reliably arrive on a host starting with `admin.`/`caller.`** — prod edge
  routing can hand the app other hostnames for the same service. The app's real admin-vs-consumer
  decision is brand resolution (`resolveBrand(host).key === "runner"` and not `runner.*` = admin), in
  `rootHandler`. Any host-based gate MUST reuse that decision, never a `startsWith()` check: the 07-15
  promote shipped a coming-soon middleware with a naive prefix check and it served the splash to THE
  Admin on prod (fixed same night, 48dcb1d). Corollary: `COMING_SOON` is only ever `1` on prod, so
  splash-gate code paths CANNOT be rehearsed on staging — verify them by booting locally with
  `COMING_SOON=1` and curling with explicit `Host:` headers (both with and without `STAGING=1`).
- **`config.staging.on` is what makes the staging service behave as staging** — `true` on the
  voice-caller-staging service, `false` on prod. The code branches on it in ~20 spots (`server.ts`, `auth.ts`,
  `staging-sim.ts`): simulated calls, the staging login code, staging websocket host. Don't remove
  `config.staging` from `config.ts` (typecheck breaks, and staging loses its behavior).
- **Logos:** the Cloudflare token lacks R2-admin and the S3 keys are object-scoped to `fungibles-cards`, so logos
  serve via the `fungibles-logos` Worker on `logos.fungibles.com` (chain-logos/ prefix), not a public R2 bucket.
- **Test calls used to WRITE mapping data** — the passive tree-learner ran on every completed call, so an
  owner Fun-store test transcript once wrote a bogus `avgTreeSeconds=19` onto a direct-answer chain and
  silenced the agent for 19s (2026-07-02). Fixed: passive learning is gated `!config.staging.on` and skips
  `ownerOnly` stores in every env. Mapping data comes from prod real calls + explicit Tree Trainer runs ONLY.
- **Every push to the staging branch RESTARTS the staging service and (before 2026-07-02) KILLED any
  live call mid-air** (EL logs "Client disconnected: 1006"; the owner got dead-air-then-hangup, a mapped
  store got hung up on). Fixed: SIGTERM drain in server.ts (old instance finishes its live bridge calls,
  cap 240s) + `drainingSeconds: 300` in railway.json. STILL: check `GET /api/voice/live` (or ask the
  owner) before pushing during an active testing session — don't rely on the drain alone.
- **The GEMINI_API_KEY is FREE-TIER — it rate-limits (429 RESOURCE_EXHAUSTED) under real traffic** and on
  2026-07-10 it silently lobotomized a live Delta call: every classify threw, every clerk reply became
  "unclear". The llm() gateway now falls back to a cheap OpenAI model on ANY Gemini failure (llm.ts,
  GEMINI_FALLBACK_MODEL, default gpt-4o-mini) — but the real fix is billing on the Gemini key.
  /api/admin/llm-ping is the quick check; note Cloudflare replaces the app's JSON 502 with its own error page.
- **Headless Chromium in a Claude session CANNOT reach staging over HTTPS** (`ERR_CONNECTION_RESET`
  direct AND through the egress proxy — the proxy resets Chromium's TLS ClientHello; curl/Node OpenSSL
  are fine). Two working recipes (2026-07-14, website lane): (a) tiny Node loopback bridge that relays
  `http://127.0.0.1:8899/*` → `https://staging.checkitforme.com/*` via fetch, point Chromium at the
  bridge; (b) better for UI verification: boot `src/server.ts` locally (`STAGING=1`, throwaway
  `DATABASE_URL=file:...`, `COMP_PHONES=<your test phone>` for gated features, login code `000000`) and
  Playwright-route-stub `/pub/stores/near` + `/app/zones*` with canned JSON. Staging's DB is NOT
  network-reachable (libSQL file on the Railway volume) — don't try to point a local server at it.
- **Kiosk retailer rows are keyed on the MACHINE, and Pokémon MOVES machines — never patch kiosk rows
  by DB id across time** (2026-07-16, data lane). The vending overlay (`POST /api/kiosks/overlay`)
  upserts the TPCi machines list by proximity + `nophone:<chain>:<Q-code>` phone keys and re-stamps
  `externalStoreId`; when TPCi relocates machine Q-codes between host stores (they do, often), a fresh
  overlay run REWRITES existing rows into different physical stores — same DB id, new identity. A batch
  of owner-googled phone numbers was applied by id an hour after export and most landed on the wrong
  stores (an Austin TX number on a San Leandro CA FoodMaxx), on BOTH envs. Fixed by
  `scripts/data-tools/fix_kiosk_misdial.py` — the pattern to copy: treat the STREET ADDRESS as store
  identity; write per-store data only to a row whose normalized address+state (plus a chain-name token —
  plazas share addresses) matches. Also: once a row carries a REAL phone it can never be phone-key-matched
  by an import again, so the next overlay run inserts a DUPLICATE row for that address — dedupe by
  address when ingesting. Root fix (open, data lane): store rows should be keyed by PLACE and machines
  overlaid via the `kiosks` table, not identity-rewritten into `retailers`.
