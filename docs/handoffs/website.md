# Check - Website

You own the consumer site **checkitforme.com** (`public/checkit.html`) — UI/UX + consumer features.

## 🎯 What needs doing (start here)

**Test these — coded but NEVER verified on a real call** (call the Fun store from Admin → Testing to check):
- Silent location re-check — never tested with an actual city-to-city move.
- `language_barrier` status — the heuristic has never been seen firing on a live call.
- Restock premium vs non-premium section — needs a visual pass.
- Result entrance animation / CTA sweep — re-look after the above.

**Build / fix:**
- **Topps hero logo** (`/toppsbasketball`): `logos/topps.png` is a low-res white-fringe PNG → halo on the
  dark hero. Needs a clean **transparent brand-RED** export (black is invisible on `#0C0C12`) — get it from
  owner/Logo, **don't recolor the trademark yourself**. Size with `--logo-scale`, match `og/topps.png`.
- **Treasure Hunt + Hobby sections**: 3,479 thrift stores are live (`chains.type="Thrift"`, muted, off MSRP
  scoring). Surface them behind a **user toggle, OFF by default**. Do **NOT** un-mute (dumps 3.5k into the
  main list) — ask DevOps for a param like `/pub/stores/near?section=thrift`. "Hobby" = a future rail, not imported yet.
- **Address on reopened calls**: old calls outside the nearby slice show no address. Needs a DevOps
  `/pub/store/:id` endpoint — request it, then fill when `SEL_STORE.address` is missing.
- **Workflow openers**: delete the "shipment" opener default (owner + Admin lane).

**Waiting on other lanes:** kiosk call script (Voice/Admin) before kiosk calling can promote; then the
consumer "Working → forward your receipt = free check" nudge is yours.

## ⛔ OFF-LIMITS — the live-call pipe (FROZEN; ask DevOps first — it broke a build once)
Don't touch, even the parts in your file:
- the live-transcript **socket + step log** in `checkit.html` (`stageForLines`/`liveStage`; socket targets `location.host`)
- the **`checkit-staging-proxy`** Cloudflare worker — never redeploy
- `src/voice/bridge.ts` + the `/listen` + `/bridge` WS handlers in `src/server.ts`

## Your lane
YOURS: `public/checkit.html`, the consumer routes in `src/server.ts` (`/`, `/<brand>`, `/pub/*`, `/auth/phone`
UI calls), consumer assets in `public/`. **NOT yours:** `public/app.html` (Admin), `src/**` core (DevOps).

## Rules
- After ANY change: **call the Fun store and confirm the transcript streams + the call hangs up clean** before
  saying it's done. **Deploy ≠ commit** — a Cloudflare worker only goes live when its deploy script runs.
- No live customers yet, so a rough edge on Fun is fine; one that ships to the real site is not.
- Push collides? `git pull --no-rebase`, push again; gnarly conflict → ping DevOps.

## Open only when you need it (don't pre-read)
endpoints → `docs/API_CONTRACT.md` (build to the shapes; changes = ask DevOps) · weird bug → `docs/GOTCHAS.md`
· copy → `docs/design/COPY_CHANGES_APPROVED.md` · store/stock shapes → `docs/STOCK_AND_GEO_API.md` · team map
+ one-branch rule → `/HANDOFF.md`
