# Gotchas — hard-won facts, so we stop rediscovering them

Non-obvious traps that cost real time. Add one the moment you learn it; delete one if it stops being true.
(Pairs with the **doc-lint** habit: before a big push, skim the docs against the code — a comment that lies is
worse than no comment. Several entries below started as wrong comments.)

## Compute / testing
- **`scripts/test-all.sh` spawns local servers + headless browsers — don't run it reflexively, and never
  leave it orphaned** (owner 07-20, it was killing his compute + morale). The `smoke:`/`qa:` lines each
  boot a server (ports 8788-8798) and Chromium. If the run is killed partway (OOM, worker restart), those
  processes keep running with nobody to stop them. Rules: (1) for a small change run ONLY the one relevant
  unit test (e.g. `tsx scripts/test-prompts.ts`), NOT the whole suite; (2) the suite now self-cleans on
  exit/Ctrl-C via a trap, but an OOM SIGKILL can't be trapped; (3) the stop button is `bash
  scripts/kill-tests.sh` — kills every orphaned test runner, browser, and port squatter. Run it any time
  compute feels stuck.

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
  Concrete bite (07-16): owner unchecked plan services in Admin → prod config changed, but the staging site
  kept showing them (staging's own `vt_plans` copy). Testing an Admin data edit on staging = mirror it into
  staging's config via `staging.checkitforme.com/admin-login?token=<staging ADMIN_TOKEN>` + the same admin API.
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

## The Admin preview rig rendered the WRONG FONT for a full day (07-17)
- `app.html` loaded Inter from Google Fonts; headless Chromium in the agent container cannot reach
  Google → every admin-preview.mjs screenshot rendered in DejaVu with different metrics. "Looks
  clean" verdicts were judged against a typeface the owner never sees. **The design is only the
  design in Inter** (same lesson checkit.html learned on 07-14 with DNS ad-blockers).
- Fix shipped: app.html self-hosts `/fonts/inter-var-latin.woff2` (the site's exact recipe) and
  admin-preview.mjs routes `/fonts/**` from public/. If you judge a render, FIRST confirm the
  headline is actually Inter (compare a lowercase 'g').

## Share/landing (/s): a gradient fading to a TRANSPARENT color leaves a green haze on iOS
- Symptom: owner's iPhone showed a faint green tint/line across the BOTTOM of the /s card; every
  headless Chromium screenshot showed the bottom perfectly clean. Cost ~7 round trips chasing it as
  a "button glow."
- Root cause: `.card.pos` background was `linear-gradient(180deg, rgba(38,100,64,.95) …, rgba(38,100,64,0) 210px), #20202A`.
  Chromium renders the `rgba(38,100,64,0)` endpoint as truly clear; **iOS Safari interpolates toward
  that RGB at low alpha, so the whole region below the last stop gets a faint GREEN wash** over the
  dark base. Invisible in Chromium, visible on the device.
- Fix: never fade to a transparent COLORED stop for a wash. Fade between two OPAQUE colors:
  `linear-gradient(180deg,#266440 0%,#20202A 46%)`. No alpha, no premultiply artifact, clean bottom.
- Lesson: a colors/fonts diff and a Chromium render CANNOT catch this — it is an iOS-paint blind spot.
  If the owner reports a tint that no render reproduces, suspect a `rgba(r,g,b,0)` gradient stop first.

  UPDATE: the opaque-gradient fix alone did NOT kill it. The real culprit was the watermark
  layer: `.cwmwrap{position:absolute;inset:0;border-radius:40px;overflow:hidden}` wrapping a
  bright-green check. iOS Safari's `overflow:hidden` + `border-radius` clip leaks a 1px line of
  the clipped content's color along the BOTTOM edge (Chromium doesn't). Fix: drop the full-card
  clip layer entirely — contain the watermark fully inside the card, and use an inset ring shadow
  instead of a border for the edge.

  CORRECTION (owner, same day): BOTH theories above are WRONG. The green line at the card's
  bottom edge has been present since the FIRST /s rebuild — before the watermark/brandmark, the
  border, and the wash all existed. So it is none of those. The only element green-and-near-the-
  bottom in every single version is the CTA button (green glow in v1, green ring + light-green
  `.shine` clipped by `.cin{overflow:hidden;border-radius:999px}` since). Prime remaining suspect:
  the `.cin` overflow+radius clip leaking the shine's green on iOS, and/or the button's green
  reflecting. UNRESOLVED — never reproduced in headless Chromium. Needs a real iPhone to bisect.
  Do NOT keep changing approved design (brandmark position, border, wash) to chase it — that was
  the mistake here; isolate it on-device first.
- **A MAPPED CHAIN IS UNTOUCHABLE — nothing may flag it out of the call lane except a remap** (owner
  law 2026-07-20, the Walgreens incident). Found: 18 mapped big-box chains (Walgreens, Target, Costco…)
  carried `stockCheckMethod=site` — a classification from `data/stock_check_intel.json` that PREDATES
  current git history (the 07-09 squash destroyed attribution) and violates the data lane's own doctrine
  (site = UNCALLABLE chains with a live stock feed, e.g. Micro Center — handoff.md §flags). It never
  "switched": the flag was constant; Mapper mapped these chains 07-10..12 on top of it and nobody
  reconciled. The 07-20 CVS/Walgreens zone-call failures were NOT this flag — the new My Zones call path
  skipped the Alpha/Bravo recipe attachment entirely (its builder is fixing it); the standard call path
  (`buildRestockVars`) attaches recipes unconditionally, and the full sweep shows all 93 mapped chains'
  recipes intact. Guards now in code: ① `seedStockCheckIntel` never re-stamps site onto a mapped chain
  (even force). ② `PATCH /api/chains/:id` returns 409 when flagging a mapped chain site/muted/no-call
  without `force:true`. ③ the mapping board ALWAYS shows mapped chains, flag conflicts surface as a
  "CONFLICT" blocker instead of hiding.
