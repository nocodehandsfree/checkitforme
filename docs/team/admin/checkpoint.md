# Check - Admin — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## 2026-07-16 (final) — EMAIL RENDERING: SOLVED + OWNER SIGNED OFF ("OK we're there", "lock it in")
Ten screenshot-judged rounds. **The mechanism (do NOT re-litigate; the laws live as the comment block
at the color constants in `src/alerts.ts` — read them before touching ANY email color):** the email is
AUTHORED as the flat-black design (pure #000000 canvas, yellow kicker, green-RING CTA, white label) —
Outlook/Apple render it verbatim. A `u + .body` stylesheet (a selector only GMAIL matches) swaps every
`em-*`-classed element to a light base that Gmail auto-darkens into its gray-card look. Key Gmail
truths, each one a failed round: it flips text lightness (dark→white, white→dark — so the Gmail CTA
label is authored near-black to render white), it mangles authored-dark-only emails, gradient locks
make it dim text, -webkit-text-fill-color is stripped, blend-mode recovery hue-inverts, and
prefers-color-scheme did NOT drive the good render. All 6 email designs walked and approved by the
owner (restock, auto_check, store_added, waitlist, confirm_email, instock_owner). Owner trims shipped:
confirm_email = no tap-instruction line, no address chip; instock_owner = ends at the restock-day
line (designs may now have empty cta = no button). From-name "Check It For Me" (code + Brevo sender
#3, done live). Inter @font-face for clients that allow it; Gmail falls back (client limit).
- NEW OPEN ASK (owner, no-spend): Gmail sender avatar shows "C" — wants the brandmark. Free path: a
  Google account for noreply@checkitforme.com with the brandmark as photo (needs human phone-verify).
  BIMI rejected for now (costs money). Leave until he asks again.
- Promotes stay with PM on the owner's word — these email changes are STAGING-ONLY until then.

## 2026-07-16 — ALERT EMAILS: full editability (Addie) — HANDOFF
Prior "one light design" rationale lives in git (`emails: switch to ONE light design`); superseded above.
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
