# Architecture & Repo Layout

## The repo (split done 2026-07)
Check lives in its OWN repo now (`nocodehandsfree/checkitforme`, app at the root) — the old
"subfolder of the Fungibles monorepo" days are over. Branches: `staging` (all work) → `main`
(production, promote-only) · `v1.0` (readme.com book mirror, Copper's lane).

## Environments + ship paths (THE section that answers "why isn't my change showing?")
One codebase, two Railway deploys, each with its OWN SQLite volume:
- **staging service** → `staging.checkitforme.com` (+ staging DB). Auto-deploys on every push to
  `staging` (~1 min). NOTE: a push restarts the service — live test calls drain, gate runs mid-push
  red with a Cloudflare 502.
- **prod service** → ALL consumer domains (`checkitforme.com` + brand subdomains, behind the
  coming-soon splash until launch) AND `admin.checkitforme.com` (THE Admin) + the live DB.

How each kind of change moves (canonical copy lives in CLAUDE.md "Ship paths" — keep in sync):
- Website/server code: session branch → merge to `staging` (you do it) → auto-deploy staging →
  **promote** (`scripts/promote.sh`, PM on the owner's word) is the ONLY road to prod.
- Admin screens (`public/app.html`): merge to staging, then `bash scripts/ship-admin.sh` → the prod
  service serves the new file from its volume in seconds. No promote, no website deploy. `--status`
  / `--rollback`; last 5 versions archived.
- Data: the Admin reads/writes the PROD DB directly (live, immediately). Sync pipes: owner settings
  (policy/plans/statuses) mirror prod→staging every 60s (`src/settings-sync.ts`) · curated store
  fields staging→prod (store-sync) · learned phone-nav prod→staging (learned-sync). Admin-API
  writes hit only the env you call.

## Folders — what's in each
| Folder | What's in it | Function |
|---|---|---|
| `src/` | TypeScript backend | the Hono server + all logic |
| `src/db/` | `schema`, `client`, `bootstrap`, `migrate`, `seed` | Drizzle ORM data layer |
| `src/voice/` | `elevenlabs`, `bridge`, `prompts`, `provider` | the calling / voice engine |
| `src/calls/` | `service`, `notify`, `tree-learn` | call orchestration + results + phone-tree learning |
| `src/stock/` | `signals`, `intel` | non-call stock rails (site checkers, Discord) |
| `src/agent/` | `admin-agent` | the in-admin Claude assistant |
| `public/` | `checkit.html`, `app.html`, assets | consumer + admin web UIs |
| `public/logos/` | brand logos + `chains/` (retailer marks, e.g. `target.png`) | logos shown on store cards & headers |
| `public/og/` | Open Graph share-card images (1200×630) | the image a link shows when shared on X/iMessage/Discord — **a web standard ("og" = Open Graph), NOT product logos** |
| `drizzle/` | generated `.sql` migrations + `meta/` | migration history — named after **Drizzle**, our ORM library |
| `data/` | store-master JSON (gzipped), zones, intel | the 100K-store import source data |
| `scripts/` | test + import + smoke scripts | `test-all.sh`, store importer, `smoke-auth.sh` |
| `workers/` | `verticals.mjs` | the Cloudflare Worker that serves the brand sites |
| `docs/` | all documentation | see the CLAUDE.md docs map |

## Folder-naming notes (FYI)
- **`drizzle/`** — the name is the ORM (drizzle-orm); it auto-generates SQL migrations into this folder.
- **`logos/`** — brand + chain logos. Could be "store-logos", but it's referenced by routes
  (`/logos/...`) and every store row, so a rename is cosmetic-for-risk → leave it.
- **`og/`** — **Open Graph** social share cards, not product logos. Renaming breaks `/og/...` routes → leave it.
- If we ever do rename folders, it's a coordinated change: update the routes in `src/server.ts`,
  the brand `logoUrl`s, and the worker — then redeploy.
