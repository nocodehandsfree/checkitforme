# Check - Admin — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## 2026-07-15b — EMAIL SYSTEM REBUILT TO COMPS V2 (Addie) — staging 63b43bd, Admin UI shipped
- **Comps v2 landed:** docs/design/emails/check-email-alerts-design.html (E1-E4). EMAIL_DESIGN matches it.
- **Gmail dark-mode mystery solved:** Gmail inverts solid colors but NOT gradients — the card's gradient
  stayed dark while its white text flipped dark (owner's broken screenshot). Card is now flat #14141A +
  color-scheme meta: dark clients show the true comp, Gmail-dark shows a clean light-flipped version.
  There is NO way to fully stop Gmail's recolor; coherent inversion is the industry-correct fix.
- **FROM = noreply@checkitforme.com NOW LIVE** (checkitforme.com was already authenticated in Brevo;
  created sender id 3 via API, flipped ALERT_FROM_EMAIL on both services). Sender name "Check".
- **welcome is DEAD → confirm_email:** adding/changing an email sends the branded confirm ask; NO alert
  email flows until confirmed (accounts.email_verified_at, sendAlert + watch sends gate on it).
  /confirm-email + /unsubscribe (signed HMAC links, RFC 8058 one-click, EN+ES branded pages) VERIFIED
  live on staging (bad token → error page; confirm → "You're set."; unsub → kills subs + unverifies).
- **Owner ping is Admin-editable:** Alerts page "Your in stock ping" (channel email/text/call/off +
  address; settings beat env). Endpoints /api/admin/owner-alert GET/POST.
- **Data cleaned (PROD):** 4 legacy email-only Clerk accounts deleted (2 fun@, 2 jared@reitzin.com, zero
  usage; one had 4 old community posts). Prod = ONE account: phone:+13106662331 w/ fun@fungibles.
  ⚠ POST-PROMOTE TODO: re-set his email via /api/admin/users/phone:+13106662331/email on PROD so
  email_verified_at stamps (new column arrives with the promote; until then his prod email is unverified).
- **Verified:** 5 email types real-sent from the new sender (5× messageIds) · confirm/unsub driven e2e ·
  tsc 0 · test-all green (only the documented consumer qa-design baseline fail) · Admin UI @ 63b43bd.
- Server-side email changes are STAGING-ONLY until next promote. On THE Admin today: owner-ping block +
  new test types show graceful errors until then. Webbie owes: My Checks email row + alerts slide-up
  (?alerts=1 deep link), email edit UI. Waitlist has NO signup front-end yet (flagged to owner).

## 2026-07-15 — ALERT EMAILS ALL BRANDED + DECOUPLED ADMIN SHIP PATH IN USE (Addie)
- **Admin UI now ships WITHOUT a promote:** commit app.html to staging, then `bash scripts/ship-admin.sh`
  (Pops built it; prod server has the endpoint). Live now: override @ 0e093ee. Server code still promotes.
- **Mystery email SOLVED:** "In stock: Fun — Pokémon" to trackalackaalerts@gmail.com = the hands-free
  OWNER ping (notifyInStock, fires on every confirmed in-stock call), sent to staging's OWNER_EMAIL env
  var (= trackalackaalerts@gmail.com, ALERT_CHANNEL=email). NOT a second signup. FROM noreply@fungibles.com
  is ALERT_FROM_EMAIL's default — flagged to owner (changing domain needs Brevo domain verification).
- **Every alert email now rides the ONE branded template** (19941fa): owner in-stock ping (was hand-rolled
  "CheckIt" HTML) · restock-watch emails (were unbranded "Runnr"!) · notifyContact fallback rebranded.
  renderBrandedEmail: {url} deep-links the CTA, empty paragraphs drop.
- **Restock alerts can ride EMAIL now:** sendAlert channel override, fanoutRestock honors the sub's
  channel, restock email templates editable in Admin (empty-save guarded against blanking defaults 0e093ee).
- **Admin test-send covers all types:** welcome / store went live / waitlist / restock email / restock
  text / owner in-stock ping. VERIFIED: all 5 email types real-sent via staging Brevo (5× "sent" w/
  messageIds) to trackalackaalerts@gmail.com for the owner to eyeball.
- ⚠ Server-side alert changes are STAGING-ONLY until next promote (Pops has one queued). On THE Admin
  today: 3 old email tests work; the 2 new types show a "ships with the next promote" line.

## 2026-07-14 — FINAL BOARD LANDED + FULL-FIDELITY PASS (Addie) — all on staging, Admin awaits promote

**CD's FINAL board (14 screens, 1a-1i + 2a-2e) landed at docs/design/comps/ADMIN_COMPS.dc.html** (unbundled
from the owner's standalone export; opens in a browser). Everything below built + verified against it:
- **Shell 1a EXACT:** brandmark-as-C + "heck" wordmark, ADMIN carved chip, dot+clock mono; track = carved
  #1B1B20, active key flex 2.1 w/ 14px stroke-2 icons; pills 12px. Toast = THE gray pill (white ring,
  14.5/800, one line) + all toast copy swept to fragments (no periods/commas).
- **2a Launch:** title+«N of M shipped», 6px bar, status-group eyebrows (To do/In progress/Done), comp rows
  (circle→green check when done, LAUNCH chip, yellow agent + carved area chips, 2-line clamp), carved
  restore strip w/ Restore key + names in sheet, SHOW MORE at 20.
- **2b Testing:** opener → single amber letter, mono meta (human/talk/total), uppercase tinted status pills.
- **2c Designer:** horizontal step rail (done=green check, current=numbered glow ring, later=carved lock),
  step title+gray sub, Back key + «Next: X» capsule pinned (sticky bottom).
- **2d Kiosk:** carved intel strip (cadence green), Received/Claimed/Unclaimed wells, Inspect key,
  «Why some don't count →» sheet, receipt rows name-first + mono meta + state chips.
- **2e Chains:** shipped earlier; muted-last sort.
- **Search:** k-title + count, floating pager KILLED → SHOW MORE, map = sheet drill-in (invalidateSize on
  open), Policy flag tooltips → gray lines, page title token 20px/800 board-wide.
- **Verified:** all 22 pages rendered @390 (3 contact sheets), 7 interactive flows green (call/wf/status/
  gtm-add/map sheets, designer stepper, chains rows), 0 page errors, tsc 0.
**⚠️ PROMOTE = POPS' JOB (owner 07-14): Pops promotes everything once Webbie finishes; owner tests the
redesign ON PRODUCTION after that and brings feedback back to this lane. Do NOT run promote.sh from here.**

**Owner's 4-screenshot pass (all fixed + on staging):** emoji stripped app-wide (lucide/brandmark only) ·
Alerts rollup/sends aligned as replines + label case unified · Policy pricing now MIRRORS Plans read-only
(legacy membership fields removed from UI; ROI calc plans hydrate from /api/admin/plans) · logoTile reads
storeType + any non-chain without logo art gets the website's hobby storefront icon.


### ⚖️ OWNER RULING 07-13 (supersedes comp 1b where they differ) — THE design bar
First comp-faithful dash was REJECTED (didn't follow the comp as a whole screen; comp itself too flat).
Approved: my full-screen mock. Its laws for every page:
- Hero answers the page in ONE number/word + honest trend/spark (hide until real data exists, never fake).
- Color with intent, iOS-Settings style: calm rows, ONE tinted icon per row, values colored only when
  state matters. Vitals numbers ALWAYS colored (owner caught black 62/31%).
- Copy = nouns + numbers ("Money · $140"). Explainers live in the SHEET sub, never on rows.
- Page title 26px/800.

### DONE (each: build → screenshot → push; zero page errors, tsc 0 each push)
dash (approved mock: hero+trend+spark, 2 vitals, icon rows) · **shell** (brandmark header, carved group
track w/ raised active key, section pills, bg #1D1D22) · results/Calls (1c log + 1d call sheet, initials
logTile, truck+day restock fact, SHOW 50 MORE) · settings/App (1i: k-switch, pill picker, policy JSON in
sheet) · fun · workflows (1e rows + 1f edit sheet, live re-render) · support (1g: wells/pills/top-questions
drill-in, chat rows, drawer→sheet) · restock (1h: hero answer, wells, funnel/landing/days drill-ins,
by-store list + store sheet) · gtm (progress hero+bar, pill filters, dot-cycle rows, add-in-sheet) ·
feedback (wells, amber-glow queue rows, transcript sheet) · statuses (CRUD rows + edit sheet, autosave) ·
testing (hero+wells strip, log rows) · users (wells, account rows, detail sheet w/ Mark test + Reset).

### KIT (defined once in app.html <style>, comments point at comps)
.peek (+pk-ic/pk-logo/pk-m/pk-st/pk-bar/.static) · ONE sheet (openSheet/closeSheet/sheetFromHolder;
borrows live DOM, grabber/swipe/scrim/Esc dismiss) · .k-switch · select.k-filter · .k-key · .k-cta ·
.k-badge · .k-danger · .k-range/.k-hero/.k-wells/.k-pills (report grammar) · .k-eyebrow/.k-title/.k-sub/
.k-note · raised .card + carved inputs/textarea global tokens · .slogo.emboss initials tile ·
comp-1d bubbles. Harness: scripts/admin-preview.mjs (stub API fixtures, `full` flag for shell shots).

### REMAINING (9): build from kit patterns, one page/push at a time
alerts (CRUD-over-LOG) · growth/Policy (CONSOLE + queues; SPLIT per board: flags+pricing console, store
requests/waitlist/moderation as queue LOGs; Zones AREA REMOVAL = open item #7 below) · calc (REPORT,
read-only) · plans (CRUD + the premium toggle-matrix backlog item) · retailers/Intel (REPORT) · search
(LOG w/ filters; map = drill-in) · add (CRUD form) · receipts/Kiosk (REPORT over LOG) · designer (CRUD
steps; heaviest — consider its own session) · trees/Chains (CRUD + mapping drill-in).

### Notes for next session
- days[] added to /api/admin/overview (server.ts, my lane) → trend chip + spark HIDE on Admin until a
  promote ships it. Not a bug.
- test-all: only pre-existing failures (qa-design off-system = consumer scope · CATEGORIES.map/.some
  page errors exist on baseline). Verified on baseline at session start.
- **CD gap:** approved 07-13 dash mock supersedes board 1b — ADMIN_COMPS needs the backfill (hero+trend+
  spark, icon rows, no row subs). Also new: initials logTile in logs (board shows it, code now matches).
- data-tip ⓘ tooltips still live on NOT-yet-redesigned pages; they convert to gray lines per page.
- supDrawer removed; statuses saveStatus() now unused by UI (autosave covers it) — safe, left in place.

### Carried backlog (non-redesign)
- Premium toggle matrix in Plans (qa-admin-plans; backend done, UI missing) — fold into plans page pass.
- Workflows env picker Prod|Staging (cross-origin auth w/ DevOps) — comp 1e shows the track; needs API.
- Per-customer account view (docs/specs/admin-user-view.md; DevOps endpoints) — users page now has the
  sheet to host it.
- Owner owes: Delta live test round 2 · Outlook email check · A2P day → SMS e2e per old runbook.
- Data Dev: null stale avgTreeSeconds on ~30 direct chains. Mapping: 13 "attempted" re-runs.
