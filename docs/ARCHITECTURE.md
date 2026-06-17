# Architecture & Repo Layout

## Two products in one repo (monorepo)
- Root (`/`) = the **Fungibles** iOS app (Expo / React Native) — a *separate* product.
- `voice-caller/` = **Check** (this product) — self-contained: own `package.json`, database, Railway
  deploy, and docs. Keeping it a subfolder is intentional. **Don't rename the folder** — it would
  break the Railway build path + many references. (A full split into its own repo is a later option;
  not worth the deploy/CI risk now.)

## `voice-caller/` folders — what's in each
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
| `docs/` | all documentation | see the HANDOFF docs map |

## Folder-naming notes (FYI)
- **`drizzle/`** — the name is the ORM (drizzle-orm); it auto-generates SQL migrations into this folder.
- **`logos/`** — brand + chain logos. Could be "store-logos", but it's referenced by routes
  (`/logos/...`) and every store row, so a rename is cosmetic-for-risk → leave it.
- **`og/`** — **Open Graph** social share cards, not product logos. Renaming breaks `/og/...` routes → leave it.
- If we ever do rename folders, it's a coordinated change: update the routes in `src/server.ts`,
  the brand `logoUrl`s, and the worker — then redeploy.
