# Admin rules — what you must know before you touch the dashboard

Not a description of the screens. **The live Admin is the record of truth for what things look like**
(owner, 08-05 — the comps drifted). Open the page and match it. This file carries only what looking
at the Admin cannot tell you: the rules, what happens behind the screen, and the surfaces that have
no buttons. Source: `public/app.html` (one file) · `src/server.ts`. Siblings: `WEBSITE_RULES.md`,
`SYSTEM_MANUAL.md`.

## The rules (all of them — break one and a gate stops you, or a customer sees it)

1. **The Admin runs on LIVE PRODUCTION DATA. Almost every save is live for customers the instant you
   tap it** — no promote, no review. That list in full: policy flags, pricing and rewards, the
   statuses registry, alert templates, community moderation, store-request status, chain
   mute/settings/workflows, store verify/online/phone edits, workflows, openers, personas, voice
   rotation, apply-draft-to-all-stores, the default workflow, the live-listen toggle, the GTM list.
   **Plans are the exception:** app-side truth is instant, but Stripe only changes on Publish.
2. **Merge to `staging` FIRST, then `bash scripts/ship-admin.sh`.** ship-admin is NOT git — it POSTs
   `public/app.html` as a server-side override from ANY branch, and the next ship from `staging`
   silently replaces it. Shipping off an unmerged branch cost the whole Admin design system
   (07-23→24). Check what's actually live with `ship-admin.sh --status`: if that commit is not an
   ancestor of `staging`, the Admin is living on borrowed time.
3. **The nav is FROZEN** to `.claude/nav-allowlist` (6 groups, 22 tabs). The nav gate BLOCKS any edit
   that adds a group, tab, or `<section>` not on that list. A new one exists ONLY when the owner says
   the word, and then the list grows in the SAME commit. Cutting is allowed; inventing is not.
4. **You cannot edit `public/app.html` until you have actually LOOKED.** The edit gate blocks it until
   a real render has run (`scripts/render-comps.ts` writes `.claude/state/comp-rendered`). Never
   hand-touch that sentinel. And never open `app.html` whole — use `docs/design/INDEX.md`, then read
   only that line range.
5. **ONE Admin, at `admin.checkitforme.com`.** Never build a second dashboard, a staging admin, or a
   "temporary viewing URL". This has been re-decided three times.
6. **Every NEW Admin feature gets comped in `ADMIN_COMPS.dc.html` first, then built** (owner standing
   rule). Existing screens match the live page, not the board.
7. **The Admin has its own copy guide:** `docs/design/copy/COPY_STYLE_GUIDE_ADMIN.md`. Admin also has
   its own grammar — five page types (LIVE · REPORT · LOG · CRUD · CONSOLE) and one report shape
   (range · hero · wells · one list · footnote). Pick a page type; don't invent a layout.
8. **Real calls cost real money.** A second tap on a store card in Stores → Search dials for real, and
   so do Chains → Map / Map-until-locked. Only the bench, Fun, and Delta rehearsal ring the owner
   instead of a store. Closed stores never dial; a store checked within 24h asks again first.
9. **Don't edit the support agent's answers from Support → Chats.** That page is for watching and
   grooming; the answers are the support lane's (`src/support/ladder.ts`, `rag.ts`).
10. **Host-based gating is banned.** Admin traffic does NOT reliably arrive on a host starting with
    `admin.` — the real decision is brand resolution in `rootHandler`. A naive `startsWith()` check
    once served the coming-soon splash to the live Admin.

## Behind the screen (the parts you cannot see by looking)

**Getting in.** Every `/api/*` is gated server-side: header `x-admin-token: $ADMIN_TOKEN`, or the
signed httpOnly `admin_session` cookie minted at `/admin-login?token=<ADMIN_TOKEN>` (30 days, set on
`.checkitforme.com` so it spans subdomains). There is no login screen — a 401 shows an overlay.
**Owner-phone SSO:** phones in `ADMIN_PHONES` get the admin cookie from normal consumer SMS sign-in,
so signing into the site signs you into the Admin. `ADMIN_TOKEN` is a Railway variable.

**The map.** Two-level nav; the active tab deep-links as a path (`admin.checkitforme.com/gtm`).
God View: Live · Users · Restock · Alerts · Policy · Calc · Plans. Stores: Intel · Search · Add ·
Kiosk. Calls: Calls · Feedback · Statuses · Chains · App. Voice: Designer · Workflows · Testing ·
Fun. Support: Chats. Launch: Go-to-Market.

**Three sources of truth live in here, and code reads them.** *Statuses* (Calls → Statuses) is the
verdict registry the consumer app renders from — an edit shows to customers instantly, but *detecting*
a new situation on a call needs extraction wiring, which is a dev task. *Plans* (God View → Plans,
setting `vt_plans`) is the pricing truth; the book's pricing pages must match it, checkable at
`GET /pub/plans`. *Policy* (God View → Policy, `PATCH /api/policy`) is global and instant.

**How a call picks its voice.** A workflow = opener set + voice rotation + tuning + persona + call
lane. The assignment cascade per call is **store override → chain → ★ default → global**. The lanes:
Alpha presses keypad tones through a menu (~free) · Bravo speaks menu words (~free) · Charlie is the
live agent once a human answers (~5¢) · Delta runs the whole call on pre-recorded clips with a cheap
classifier and escalates to Charlie when the clerk goes off-script (~2.5¢).

**Live surfaces with NO buttons — don't go looking for UI.** The global calling kill-switch
(`POST /api/admin/calling/pause|resume`) · the zones admin API (consumer zones are live; the admin UI
was never built) · the schedules API (the blank Calls → Schedules tab was REMOVED 07-15; consumer
scheduling is unaffected, but there is still no admin view of scheduled checks) · store
dedupe/quarantine/relink/grade maintenance · table dump and load · staging→prod `/api/store-sync`
(prod receives only) · `/api/ops/*` watchdog and backup-now · a `#catalog` section that exists but is
unreachable from the nav.

**Staging vs prod.** Staging (`STAGING=1`) is the same app with `noindex`, and calls and texts are
disabled unless opted in (`STAGING_CALLS=1` / `STAGING_SMS=1`). Consumer checks on staging produce
simulated calls — a scripted ~22-second fake transcript, zero telephony cost (`src/staging-sim.ts`).
**The Admin always reads live prod data, even on staging**, which is why an Admin data edit tested on
staging has to be mirrored into staging's own config separately.

**Fun / MVP demo stores:** the phone-number field IS the on/off switch — save a number and it goes
live, clear it and it hides. Owner-only, and excluded from every real statistic.

**Known dead weight (harmless, not reachable):** a pile of JS referencing removed HTML — the Live
Listen card, Bridge Call, Tree Lab, voice presets, the bail-rules editor. Functions exist, elements
don't.
