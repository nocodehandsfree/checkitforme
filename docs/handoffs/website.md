# Check - Website — worklog

**Returning to this? Read only the WORKING SET below.** First time / new chat? Read the CHARTER at the
bottom once, then the working set. Reference docs are listed in the charter — open them **only** when a task
needs them (don't pre-read).

---

## 🎯 WORKING SET — the live work (keep this true)
> **Update rule:** the moment you finish, get blocked, or discover a task — edit this block. And do a quick
> pass before you end a session. This is the only thing the next chat re-reads, so it must be current.

**▶ Doing now:** — (nothing claimed; pick from below)

**⚠️ Test — coded but NEVER verified on a real call** (call the Fun store from Admin → Testing):
- Silent location re-check — never tested with an actual city-to-city move.
- `language_barrier` status — heuristic never seen firing on a live call.
- Restock premium vs non-premium section — visual pass.
- Result entrance animation / CTA sweep — re-look after the above.

**🔨 Build / fix:**
- **Topps hero logo** (`/toppsbasketball`): `logos/topps.png` is low-res white-fringe → halo on the dark hero.
  Needs a clean **transparent brand-RED** export (black is invisible on `#0C0C12`) — get it from owner/Logo,
  **don't recolor the trademark**. Then size `--logo-scale`, match `og/topps.png`.
- **Treasure Hunt + Hobby sections**: 3,479 thrift stores live (`chains.type="Thrift"`, muted, off MSRP).
  Surface behind a **user toggle, OFF by default**. Do **NOT** un-mute (dumps 3.5k into the main list) — ask
  DevOps for a param like `/pub/stores/near?section=thrift`. "Hobby" = a future rail, not imported yet.
- **Address on reopened calls**: old calls outside the nearby slice show no address → ask DevOps for a
  `/pub/store/:id` endpoint, then fill when `SEL_STORE.address` is missing.
- **Workflow openers**: delete the "shipment" opener default (owner + Admin lane).

**⏳ Blocked / waiting on others:** kiosk call script (Voice/Admin) before kiosk calling can promote; then the
consumer "Working → forward your receipt = free check" nudge is yours.

**✅ Recently done** (newest first; trim when long): —

---

## 📌 CHARTER — read once, rarely changes
You are **Check - Website**: you own **checkitforme.com** (`public/checkit.html`) — consumer UI/UX + features.

- **Lane (yours):** `public/checkit.html`, consumer routes in `src/server.ts` (`/`, `/<brand>`, `/pub/*`,
  `/auth/phone` UI calls), consumer assets in `public/`. **NOT yours:** `public/app.html` (Admin), `src/**`
  core (DevOps).
- **⛔ Off-limits — the live-call pipe** (FROZEN; ask DevOps first — it broke a build once): the live-transcript
  **socket + step log** in `checkit.html` (`stageForLines`/`liveStage`; socket → `location.host`);
  `src/voice/bridge.ts` + the `/listen`+`/bridge` WS handlers.
- **Rules:** after ANY change, **call the Fun store — confirm the transcript streams + the call hangs up clean**
  before "done." **Deploy ≠ commit** (a Cloudflare worker only goes live when its deploy script runs). One
  branch, no staging. Push collides? `git pull --no-rebase`, push again; gnarly conflict → ping DevOps.
- **Open ONLY when a task needs it:** endpoints → `docs/API_CONTRACT.md` (build to the shapes; changes = ask
  DevOps) · weird bug → `docs/GOTCHAS.md` · copy → `docs/design/COPY_CHANGES_APPROVED.md` · store/stock shapes
  → `docs/STOCK_AND_GEO_API.md` · team map + one-branch rule → `/HANDOFF.md`.
