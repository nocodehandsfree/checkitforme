# Check - Admin — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## 2026-07-17 — Testing/Feedback staging source SHIPPED · design audit delivered, awaiting go-ahead
- **Live on THE Admin (ffa130f, verified end to end):** Testing + Feedback carry a "Live site /
  Staging site" k-filter pill. Root cause of "my Fun calls are missing": rehearsal calls + feedback
  taps land in the STAGING service's DB; the Admin reads prod. Staging reads ride the root-domain
  admin cookie (shared SESSION_SECRET) through a CORS gate in server.ts scoped to
  https://admin.checkitforme.com. Review/correct writes hit the source the row came from. Feedback
  badge stays live-only. Staging 401 → inline "sign in on staging once" empty state, never the
  global auth gate.
- **PM note:** the CORS middleware (src/server.ts, ABOVE the /api auth gate) is on staging and rides
  the next promote — a no-op on prod (Admin is same-origin there). Nothing waits on it.
- **Live-listen answered:** owner's phone is in COMP_PHONES → comp accounts ALWAYS get live audio +
  hang-up when signed in; the Policy box only turns it on for every customer. checkit.html:5085.

### 🎨 DESIGN AUDIT 07-17 (vs ADMIN_COMPS + STYLE_GUIDE + admin copy guide) — REPORT ONLY, no go-ahead yet
1. **Alerts — worst, and NO comp exists.** 8 stacked sections; 5 template cards with every textarea
   open + an explainer paragraph each; token cheat-line; test-send widget; sends log. Fix shape:
   status strip → templates as CRUD rows opening ONE edit sheet (test-send inside) → sends = LOG.
   Standing rule: comp it in ADMIN_COMPS first.
2. **Policy (Growth) — the split the comp board prescribed never happened.** 17 flag toggles each
   with a description sentence + pricing form + plans tables + 4 queues on one page. Comp verdict:
   flags/pricing stay CONSOLE (one-line grays); store requests/waitlist/moderation → LOG queues.
3. **Designer — rail matches comp 2c, step bodies don't.** Purple ⓘ info-circles (banned accent;
   comps: tooltips become gray lines), hairline <hr>s, 60-word Delta hints in step 2, persona
   BUILDER embedded in step 4 (should be a sheet; the step keeps picker rows), step 6 Advanced is a
   <details> accordion (comps killed accordions).
4. **Fun — minor pass.** Purple ⓘ circles, second card missing its title, phone asked twice.
Checked clean (screenshot or markup): App console, Statuses, Users, Search, Chains, Testing,
Feedback, Calls, Support, GTM, Kiosk, dash.

## 2026-07-16 (final) — EMAIL RENDERING: SOLVED + OWNER SIGNED OFF ("OK we're there", "lock it in")
Ten screenshot-judged rounds. **The mechanism (do NOT re-litigate; the laws live as the comment block
at the color constants in `src/alerts.ts` — read them before touching ANY email color):** the email is
AUTHORED as the flat-black design (pure #000000 canvas, yellow kicker, green-RING CTA, white label) —
Outlook/Apple render it verbatim. A `u + .body` stylesheet (a selector only GMAIL matches) swaps every
`em-*`-classed element to a light base that Gmail auto-darkens into its gray-card look. Gmail truths,
each a failed round: it flips text lightness both ways, mangles authored-dark-only emails, gradient
locks dim text, -webkit-text-fill-color is stripped, blend-mode recovery hue-inverts, and
prefers-color-scheme did NOT drive the good render. All 6 designs walked + approved. Owner trims
shipped (confirm_email + instock_owner; designs may have empty cta = no button). From-name "Check It
For Me" live (code + Brevo sender #3). Inter @font-face where allowed; Gmail falls back.
- OPEN ASK (owner, no-spend): Gmail avatar shows "C" — wants the brandmark. Free path: Google account
  for noreply@ with brandmark photo (needs human phone-verify). BIMI rejected (costs). Wait for him.
- Promotes stay with PM on the owner's word — server-side email changes are STAGING-ONLY until then.

### Alert system — how it works (all in src/alerts.ts + calls/notify.ts + calls/service.ts)
- Events: restock (text|email), auto_check (text|email), store_added / waitlist / confirm_email
  (email), instock_owner (owner ping). EVENT_CHANNEL + EMAIL_DESIGN + DEFAULT/ES_TEMPLATES.
- Email BODY editable in Admin ▸ Alerts (`emailBody`, sentence-split, **bold** + {token}). Copy is
  generic — one template serves 4 brands, never hardcode "Pokemon". EN+ES; Admin edits EN.
- Bilingual: accountLang picks es only when accounts.language='es'. confirm-gate: no alert email
  until /confirm-email tapped. /unsubscribe = signed HMAC one-click. Owner ping: Admin ▸ Alerts.
- FROM = noreply@checkitforme.com (Brevo id 3). Admin test dropdown covers all 8 send types.
- ⚠ Server-side email changes STAGING-ONLY until Pops' next promote (new cols accounts.language +
  call_results.customer_schedule_id + accounts.email_verified_at bootstrap-migrate on deploy).
- POST-PROMOTE TODO: re-set the owner's email on PROD (/api/admin/users/phone:+13106662331/email).

### ⚠ OWNER'S OPEN ASKS (cross-lane, unfinished)
1. Store LOGOS on the WEBSITE alerts view (Webbie; skipped in email on purpose).
2. Copper: fold tightened restock/auto_check wording into COPY_STYLE_GUIDE.md.
3. Webbie: My Checks email row + alerts slide-up (?alerts=1) + email-edit UI; waitlist signup UI.

### ⚖️ OWNER RULING 07-13 — THE design bar (Admin pages)
Hero answers the page in ONE number/word + honest spark (HIDE until real data — never fake). Color
w/ intent (iOS-Settings: calm rows, ONE tinted icon; vitals ALWAYS colored). Copy = nouns + numbers;
explainers live in the SHEET sub. Page title 20px/800.

### KIT (defined once in app.html <style>; comps ADMIN_COMPS.dc.html)
.peek (+pk-*) · ONE sheet openSheet/closeSheet/sheetFromHolder (website physics) · carved inputs +
selects · ghost = raised key · .k-switch/.k-filter/.k-key/.k-cta/.k-badge/.k-danger · report grammar
.k-range/hero/wells/pills · .k-eyebrow/title/sub/note · .slogo.emboss · srcApi/srcPicker (call-data
source). Harness: `node scripts/admin-preview.mjs <section> out.png 390`. Safari chrome: html bg
#1D1D22 + apple metas + safe-area padding.

### Carried backlog (non-redesign)
- Premium toggle matrix in Plans (backend done, UI missing) — fold into a plans pass.
- Workflows env picker Prod|Staging (comp 1e env track; srcApi + CORS now exist — half the work done).
- Per-customer account view (docs/specs/admin-user-view.md; users sheet can host it).
- test-all: only pre-existing consumer qa-design baseline items are expected fails.
