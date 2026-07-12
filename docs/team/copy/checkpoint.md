# Check - Copy — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".**

## 2026-07-11 — shipped to STAGING (deployed, verified)
All code + copy now lives on `staging` (not a side branch — that was the mistake, corrected).

**Site copy fixes (checkit.html + app.html), EN+ES:**
- 45 Spanish parity keys added (Zones feature, referral, account, scores, schedule, toasts) via
  an `Object.assign(I18N.es, {...})` right after the dict. Two hardcoded auth strings keyed
  (`auth.wetexted/entercode/notget/resend/changenum`).
- Em dashes removed from sentences (toast.toosoon EN+ES, sc.noinstock, toast.anytown).
- Banned word: "unlocked" → "ready" (k.thanks.free).
- Admin: "answer like a clerk" → "…like Staff" (app.html, 2 spots).
- Warmer voice: toast.anytown, zones.nocredits, zones.up.sub, err.email.
- ⚠️ TRAP: EN default strings are single-quoted JS. An apostrophe ("You're") breaks the whole
  `<script>`. Escape it (`You\'re`) or reword. There's a syntax-check one-liner in the session
  (node + vm compile of every inline script) — run it before pushing checkit.html.

**Footer / FAQ / About (checkit.html + server.ts):**
- Footer: FAQ→**Guide** (opens the book), Contact→**Help** (opens the live support messenger).
- `/p/faq` retired → 301 to the book (EN+ES page content removed). Messenger FAQ tab already
  pulls the book's Top-15 (`/pub/support/faq` → getFaq()).
- About page rewritten with the founder story + book link (EN+ES).

**The book (branch v1.0 → readme.com), owner feedback pass:**
- Kiosk: call confirms the machine is **on/working, not shut off** (not "stocked").
- Exact products: reframed around **multiple products in one call** (Pokémon → One Piece → Topps NBA).
- Your voice: removed the clone promise (rolling out).
- Zone sweeps: "all at the same time" + add-by-radius.
- Thrift: **old collections people got rid of**. Hobby is now its own Check+ row **below** Thrift.
- Verdict page: added **Restock incoming** + fuller status grouping (from live /pub/statuses).
- Hero image swapped to the **loaded store list** (52 open, Best Bets).
- Top-15 FAQ page lives at slug `common-questions` (the messenger's FAQ source).

**Copy guides:**
- `COPY_STYLE_GUIDE.md` scoped to **Website**; notification rule no longer dictates color
  (defers to Design). `COPY_STYLE_GUIDE_ADMIN.md` created for Claude Design's admin comp.
- Internal manuals on staging: `docs/shared/ADMIN_MANUAL.md · WEBSITE_MANUAL.md · SYSTEM_MANUAL.md`.

## ⏳ WAITING ON OWNER (Copper is tracking these; follow up if silent)
1. **Prod push is OWNER-BATCHED** (07-11): do NOT promote staging→main piecemeal. Prod is way
   behind + not going live yet; owner does ONE massive push later. Everything Copper shipped sits
   verified on staging, ready for that push. Nothing to do here but wait.
2. **ReadMe appearance** (free settings, dashboard-only — owner applies): sent transparent
   `check-mark.png` (favicon) + `check.png` (logo). Recommended recipe delivered 07-11:
   Layout Modern · Logo=check.png (delete old jpg) · Favicon=check-mark.png · Brand/Link color
   #4ADE80 (fixes the contrast warning) · Theme Dark · Typography Bigger · Header Solid dark, no
   triangle overlay. Deep CSS/nav = PAID tier → parked.
3. **Book review** — owner going page by page; round-1 notes applied, more coming.
4. **Voice polish** (deferred to his review): watch.left, cs.reach.menu, sup.faq.* wording.
5. **Rolling-out features** — when Delta multi-product / your-voice / store-holds actually ship,
   update the book pages that say "rolling out."
6. **Public developer API** — asked, declined for now.

_Follow-up scheduled (send_later) to re-surface this list if the owner goes quiet._

## Flagged to other lanes (not owner's job, for awareness)
- Admin → Calls → Schedules tab is blank (no section/loader).
- MRR stat uses the legacy $4.99 constant (understates once anyone buys a bigger plan).
- "Spend today" counter on the calling kill-switch is fed by nothing (reads 0).
- qa-design: pre-existing off-palette colors in v2 scope.
