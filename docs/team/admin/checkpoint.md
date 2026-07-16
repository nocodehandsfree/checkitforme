# Check - Admin — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## 2026-07-16 — ALERT EMAILS: ONE LIGHT DESIGN + full editability (Addie) — HANDOFF
**The email-rendering saga is RESOLVED — do NOT reopen it or go back to a dark email (reverted crime).**
Root cause (Litmus/Email-on-Acid + 3 real dark emails the owner sent): Gmail (the majority client) is
built to DARKEN light emails for dark-mode users and show them light otherwise. A DARK email fights that
→ Gmail flips it to WHITE (the bug chased for hours). Pure #000/#fff also trigger aggressive invert.
**Fix = ONE clean LIGHT email**: off-white #F3F3F6 page, near-black #15151B text, filled brand-green
button, NO pure black/white, `color-scheme: light dark` so every client adapts (light in light mode,
auto-darkened in dark). Verified both schemes in-browser; sent to fun@fungibles + trackalackaalerts +
restocktimer. All lives in `src/alerts.ts` renderBrandedEmail/moduleHtml.
- **Email BODY editable in Admin now:** the branded email body renders from the template `emailBody`
  (split by sentence, **bold** + {token}). Editing Admin ▸ Alerts changes the email for real. Restock
  body = "Get going, this stuff doesn't stay on the shelves for very long." (generic — one template
  serves all 4 brands, so DON'T hardcode "Pokemon"; owner edits live).
- Restock = PRODUCT-FIRST (headline {product}, store once, no panel, CTA "Get directions"→Google Maps of
  the store). auto_check same. Footer = Manage alerts ONLY. Brandmark not wordmark. EN+ES, Admin edits EN.

### ⚠ OWNER'S OPEN ASKS (unfinished)
1. Store LOGOS by store name — owner agreed to SKIP in email (images blocked → broken box); wants it on
   the WEBSITE alerts view instead (Webbie's lane). Not built.
2. Copper to fold my tightened restock/auto_check wording into COPY_STYLE_GUIDE.md.
3. Owner still to eyeball the LIGHT version in Gmail and bless it.
4. Webbie owes: My Checks email row + alerts slide-up (?alerts=1 deep link) + email-edit UI; the
   footer "Manage alerts" link points there. Waitlist has NO signup front-end yet.

### Alert system — how it works (all in src/alerts.ts + calls/notify.ts + calls/service.ts)
- Events: restock (text|email), auto_check (text|email), store_added / waitlist / confirm_email (email),
  instock_owner (owner ping, email, internal EN). EVENT_CHANNEL + EMAIL_DESIGN + DEFAULT/ES_TEMPLATES.
- Bilingual: accountLang(account) picks es only when accounts.language='es' (new col; /app/email captures
  site LANG). {result}→localizeResult. Everyone English until the site sends lang.
- confirm-gate: no alert email to an address until it taps /confirm-email (accounts.email_verified_at).
  /unsubscribe = signed HMAC one-click. Both are branded EN+ES landing pages (server.ts).
- Owner in-stock ping: Admin ▸ Alerts "Your in stock ping" (email|text + address; settings beat env).
- auto_check results: call_results.customer_schedule_id links a fire to its schedule → every terminal
  path alerts the owner with the statuses label. Restock fan-out pings EVERY watcher, finder irrelevant.
- FROM = noreply@checkitforme.com (Brevo sender id 3, ALERT_FROM_EMAIL on both services). Admin test
  dropdown covers all 8 send types.
- ⚠ Server-side email changes STAGING-ONLY until Pops' next promote (new cols accounts.language +
  call_results.customer_schedule_id + accounts.email_verified_at bootstrap-migrate on deploy). Admin UI
  itself ships DECOUPLED: commit app.html → `bash scripts/ship-admin.sh` (no promote).
- POST-PROMOTE TODO: re-set the owner's email on PROD (/api/admin/users/phone:+13106662331/email) so
  email_verified_at stamps.

### ⚖️ OWNER RULING 07-13 — THE design bar (Admin pages)
Approved: my full-screen mock (comp 1b too flat). Laws: hero answers the page in ONE number/word + honest
trend/spark (HIDE until real data — never fake, incl. the dash spark on a week of zeros). Color w/ intent
(iOS-Settings: calm rows, ONE tinted icon, values colored only when state matters; vitals ALWAYS colored).
Copy = nouns + numbers; explainers live in the SHEET sub. Page title 20px/800.

### KIT (defined once in app.html <style>; comments point at comps ADMIN_COMPS.dc.html)
.peek (+pk-*) · ONE sheet openSheet/closeSheet/sheetFromHolder (borrows live DOM; drag = WEBSITE physics,
scroller-walk arm, animate-out past 110px) · carved inputs + selects (no hairline borders) · ghost = raised
key · .k-switch/.k-filter/.k-key/.k-cta/.k-badge/.k-danger · report grammar .k-range/hero/wells/pills ·
.k-eyebrow/title/sub/note · .slogo.emboss. Harness: `node scripts/admin-preview.mjs <section> out.png 390`.
Safari chrome: html bg #1D1D22 root-sampled + apple metas + safe-area padding (site recipe).

### Carried backlog (non-redesign, mine or cross-lane)
- Premium toggle matrix in Plans (backend done, UI missing) — fold into a plans pass.
- Workflows env picker Prod|Staging (needs DevOps cross-origin API).
- Per-customer account view (docs/specs/admin-user-view.md; users page has the sheet to host it).
- test-all: only pre-existing consumer qa-design baseline items are expected fails.
