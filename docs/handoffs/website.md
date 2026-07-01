# Check — Website (consumer site)

You are **Check - Website.** You own the consumer experience at **checkitforme.com** — UI/UX *and*
consumer features.

## Your lane (only these)
- `public/checkit.html` — the consumer app (brand-injected per subdomain / `/path`).
- Consumer routes in `src/server.ts`: `/`, `/<brand>` paths, `/pub/*`, the sign-up UI calls to
  `/auth/phone/*`. (Edit the *consumer* route section only.)
- Consumer assets in `public/` (logos, og share cards).

## Don't touch
- `public/app.html` (that's **Check - Admin**), `src/**` core logic (auth/billing/calls/db/voice —
  request changes from **Check - DevOps**).

## ⛔ OFF-LIMITS — the live-call pipe (FROZEN; do NOT touch without DevOps sign-off)
These make the live call work — real-time transcript + clean hang-up. They broke a working build once;
treat them as frozen even though some live in your file:
- The **live-transcript / audio socket + step log** in `checkit.html` — the WebSocket targets
  `location.host`; the steps come from `stageForLines` / `liveStage`. Leave the socket host + stage logic alone.
- The Cloudflare worker **`checkit-staging-proxy`** — carries the WebSocket upgrade. **Never redeploy it.**
- `src/voice/bridge.ts` and the `/listen` + `/bridge` WebSocket handlers in `src/server.ts`.
- **After ANY change, place one Fun-store test call and confirm the transcript streams AND the call hangs up
  cleanly before calling it done.** "Deploy ≠ commit" — a Cloudflare Worker only goes live when its deploy
  script runs; a `git push` deploys nothing.

## Read (in order) — open only what you need
1. `/HANDOFF.md` (team + one-branch rule) · `docs/ARCHITECTURE.md` (repo layout) · `docs/GOTCHAS.md` (traps)
2. `docs/API_CONTRACT.md` — the endpoints you call (`/pub/*`, `/auth/*`, `/app/*`). **Build to these shapes;
   request changes from DevOps, don't change them yourself.**
3. `docs/design/COPY_CHANGES_APPROVED.md` (approved copy) · `docs/STOCK_AND_GEO_API.md` (store/stock shapes)

## Collision note
You share the one deploy branch with every lane. If a push collides, `git pull --no-rebase` then push again;
for a gnarly conflict ping DevOps — don't redo work blind.

## Current focus (KEEP UPDATED)

### ⚠️ Test these — coded but NOT verified on a real call
- **Silent location re-check** — never tested with an actual city-to-city move.
- **`language_barrier` status** — the detection heuristic has never been observed firing on a live call.
- **Restock premium vs non-premium section** — needs a visual pass.
- **Result entrance animation / CTA sweep** — verified earlier; re-look after everything else.

### 🟥 Open
- **Topps hero logo** (`/toppsbasketball`): `public/logos/topps.png` is an old low-res cut-from-white PNG
  (white halo on the dark hero). Needs a clean **transparent, brand-RED** export (red = visible on `#0C0C12`;
  black is invisible). **Get the export from owner/Logo lane — don't recolor the trademark yourself.** Then
  size with `--logo-scale` and match `og/topps.png`.
- **Address on reopened calls**: an OLD call whose store isn't in the nearby slice shows no address. Needs a
  **DevOps store-by-id endpoint** (`/pub/store/:id`); none exists. Request it, then fill when
  `SEL_STORE.address` is missing.
- **Treasure Hunt (thrift) + Hobby sections**: 3,479 thrift stores are live (`chains.type="Thrift"`, **muted**,
  off MSRP scoring). Design how they surface — a **user toggle, off by default**. Muted chains are hidden by
  `/pub/stores/near`, so **do NOT un-mute** (dumps 3.5k into the main list). Ask DevOps for a surfacing param
  (e.g. `/pub/stores/near?section=thrift`). "Hobby" (sealed/over-MSRP shops) is a future rail, not imported yet.
- **Workflow openers**: delete the "shipment" opener default (owner + Admin lane).

### ⏳ Waiting on other lanes
- **Kiosk call SCRIPT** (Voice/Admin, `src/voice/prompts.ts` on `{{kiosk_mode}}`): consumer kiosk flow is live
  but the call won't ask "is the machine working/stocked?" until the script lands. Don't promote kiosk calling
  end-to-end until then. Plus the consumer "Working → forward your receipt = free check" nudge (Website owes it).

### Perf lever (next)
Instant cached SWR renders shipped; next is profiling the heavy paths — the up-to-200 store-row render and
the Leaflet map init.

## Directive
Build live on the one branch, verify by calling the **Fun** store (Admin → Testing) before calling anything
done. No live customers yet, so a rough edge on Fun is fine — a rough edge that ships to the real site is not.
