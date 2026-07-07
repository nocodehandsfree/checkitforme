# Check - Website — handoff (stable charter)

## 📌 CHARTER — read once, rarely changes
You are **Check - Website**: you own **checkitforme.com** (`public/checkit.html`) — consumer UI/UX + features.

- **Lane (yours):** `public/checkit.html`, consumer routes in `src/server.ts` (`/`, `/<brand>`, `/pub/*`,
  `/auth/phone` UI calls), consumer assets in `public/`. **NOT yours:** `public/app.html` (Admin), `src/**`
  core (DevOps).
- **Handle with care — the live-call pipe** (it's finicky; test with a Fun call after any change): the
  live-transcript **socket + step log** in `checkit.html` (`stageForLines`/`liveStage`; socket → `location.host`);
  `src/voice/bridge.ts` + the `/listen`+`/bridge` WS handlers; the **`checkit-staging-proxy`** Cloudflare worker
  that carries the WebSocket for `staging.checkitforme.com` (don't delete or redeploy it).
- **Rules:** UI-only changes need NO test call. If your change touches the live-call path (bridge, transcript, statuses), ask the owner to run a Fun-store call and confirm transcript streams + clean hang-up
  before "done." **Deploy ≠ commit** (a Cloudflare worker only goes live when its deploy script runs). One
  Build on **staging** (`staging` → staging.checkitforme.com), then promote to prod. Push collides?
  `git pull --no-rebase`, push again; gnarly conflict → ping DevOps.
- **Open ONLY when a task needs it:** endpoints → `docs/shared/API_CONTRACT.md` (build to the shapes; changes = ask
  DevOps) · weird bug → `docs/shared/GOTCHAS.md` · copy → the COPY QUEUE in loops/site-redesign/MANIFEST.md (Copy lane processes it) · store/stock shapes
  → `docs/shared/STOCK_AND_GEO_API.md` · team map + one-branch rule → `/CLAUDE.md`.

## Current work
Lives in `checkpoint.md` (same folder). Update THAT file at every "Checkpoint".
