# Completed work (log)

Finished items live here so the active docs (HANDOFF) stay lean. Newest first. Agents: move done
items here from HANDOFF's "Current focus."

## 2026-06-16 — DEPLOYED to production
- Merged the integrated branch → `main`; Railway deployed. Verified live on checkitforme.com
  (`/auth/phone/start`=400, health=200, prod security boot-gate passed). Full backend now live.
- Team model: per-role handoffs (`docs/handoffs/`), reorganized docs into `docs/{business,finance,
  security,ops}/`, lean Check-branded HANDOFF, consolidated backlog in ROADMAP.

## 2026-06-16 — phone-first auth + hardening
- **Phone-first auth** — SMS login (Twilio Verify) + own signed session (Clerk-free path); dual-auth
  so Clerk + phone-session both work during cutover.
- **Caller-ID** — Twilio verify-call flow (`/auth/callerid/*`); calls dial AS the customer's verified
  number on the bridge path. `caller_id` stays null until verified.
- **Server-side atomic billing** — charge on call completion, idempotent via `charged_at`
  (poller + webhook can't double-bill; client can't dodge). `/app/charge` neutered to a balance read.
- **Comp-by-phone** (`COMP_PHONES`/`isCompAccount`) · **spend kill-switch** (admin pause/resume) ·
  **prod security boot-gate** (refuses open-admin / weak-session in prod) · **single-leader schedulers**.
- **One-check-per-store-per-day** (flag, off) · **stored-SVG XSS** fix · complete `esc()` ·
  constant-time webhook signature compares · **XFF rate-limit** fix.
- **`/pokemon` path routing** · brand → "Check It For Me" · `runner.html → checkit.html` · **Brevo** email sync.
- DB indexes (phone, finder, status) · **25 auth/billing tests** · `smoke-auth.sh`.
- Infra wired: Helicone, Qdrant, Redis, PostHog, TiDB (staged) · domain **checkitforme.com** on
  Cloudflare (DNS, worker routes, TLS strict, Bot Fight Mode, rate-limit) + `admin.checkitforme.com`.

## Earlier
- Full consumer + admin product, 100K-store DB, live voice calling with watch-live transcripts,
  restock intel, growth loops, white-label verticals. (Build logs in `docs/archive/`.)
