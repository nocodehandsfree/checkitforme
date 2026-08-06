# Go-live site audit (owner asked 07-31, research only — fix AFTER his Echo/Charlie testing)

**System:** site · **Status:** active — findings list, nothing built. Owner adds/reorders freely.
Round 1 = the owner's own list. Round 2 = found by digging, he had not seen these.

---

## ROUND 2 — found by digging (owner had NOT seen these)

1. **The Alerts screen controls one thing; a different thing sends the email.** An alert is stored
   TWICE: the subscription row the sheet lists (On/Off, trash, Pause all) and a separate sender row
   (`watches`) that `notifyWatches` actually emails from when a check confirms stock. The sheet never
   touches the sender row (`grep watches src/alerts.ts` = nothing). So **Off, Delete, and Pause all do
   not stop in-stock emails from a check.** Before 07-31 this was masked because sender rows switched
   themselves off after one email; making alerts standing (correct) exposes it. `fanoutRestock` (which
   DOES respect mute/pause) only runs from `/api/stock/ingest`, never from a check finalize.
   **Fix shape:** one record, or the sheet's three controls write through to the sender row.
2. **A comp account can save an auto-check but never see it** — which is why the owner has never seen
   an auto-check screen. Server allows the save (`isCompAccount(a) || subscription === "active"`,
   `/app/schedule`), the page hides the list unless `ACCOUNT.subscription === 'active'`
   (`loadSchedules`, checkit.html ~:4186). His own account is comp, so it saves and vanishes.
3. **A finished auto-check looks identical to a check he ran himself.** `customerScheduleId` is on the
   result row server-side and is never surfaced in the consumer page (0 hits in checkit.html).
4. **Production has never sent a single email, and cannot today.** `/api/alerts/log` on prod = 0 rows.
   Prod has 1 account, it has an email address, and it is NOT confirmed. `sendRestockEmailTo` refuses
   any address whose account lacks `emailVerifiedAt` (logs `skipped_unverified`). So a prod alert is
   silently skipped. **CORRECTION to an older note: prod is NOT missing its email keys** — BREVO_API_KEY,
   ALERT_FROM_EMAIL, ALERT_CHANNEL, OWNER_EMAIL, APP_URL are all set on prod (verified in Railway).
   The gap is the confirm-your-email step, not the sender.
5. **Production is missing settings staging has** (Railway, key names only): `ELEVENLABS_MIDCALL_AGENT_ID`,
   `BRAIN_API_KEY`, `ANTHROPIC_API_KEY`, `COMP_PHONES`, `STORE_SYNC_URL`/`STORE_SYNC_TOKEN`.
   **The dangerous one is `ELEVENLABS_MIDCALL_AGENT_ID`** — the calling engine's bridge reads it
   (`src/voice/bridge.ts` ~:586/593, `bridge-place.ts` ~:112) to join Charlie mid-check. Flip the new
   engine on for the real site with that unset and prod checks behave differently from staging.
   `COMP_PHONES` missing means a phone-first comp account is not comp on prod.
   Low risk: ANTHROPIC (Admin assistant only), BRAIN (only if `ourBrain` is switched on).
   The verdict second read uses Gemini, whose key IS on prod.
6. **Two switches differ prod vs staging** (both calling-engine): `connectOnHuman` prod ON / staging OFF,
   `cheapBridgeAll` prod OFF / staging ON. Every alert-related switch matches.

## ROUND 1 — the owner's own list, confirmed by driving staging
7. **Alerts slide-up sits too short.** Sized by content (max-height 86vh, no minimum), so with one or
   two rows it parks low and My checks shows behind it. (`#alertsOv .modal`, ~:2088.)
8. **Radius slider reloads slowly.** Every stop fires a fresh `/pub/stores/near` (200-store ask, no
   debounce, no local cache): measured 488ms for 87 stores at 5 mi, 601ms for 214 at 25 mi, and a drag
   queues several. Fix shape: debounce, and/or re-filter locally from the widest slice already loaded.
9. **Spanish footer wraps to two rows** (measured live). No button overflow on the home page in Spanish.
   NOT yet swept in Spanish: the result page, the sheets, My checks.
10. **Auto-check after save:** sheet closes, customer stays on the store page, one bottom notification.
    No email on save (owner: correct, none wanted) but no confirmation screen either. Comp: round 3.
11. **A real scheduled auto-check has never been watched end to end.** Result emails are wired
    (07-31 notifier) but no fire has been observed. One rehearsal needed.

## ROUND 3 — the comps: MOVED (08-06)
The hand-drawn comp file was rejected by the owner on 08-05 and deleted. The real pictures, their
approval state, and his exact ruling on the report now live in `docs/specs/auto-checks/README.md`;
the build contract is `docs/tasks/site-auto-checks.md`.

## What was FIXED off this list (08-01 to 08-06, all on staging)
Finding 1 (the Alerts screen controlled the wrong record) · 7 (the sheet sat too short) · 8 (the
radius slider reloaded slowly, fixed without touching the drive-along store refresh) · 9 (the Spanish
footer wrapped: "Info" fits, measured). Findings 2, 3 and 10 are the auto-checks build. **Findings 4,
5, 6 and 11 are still open, and 4, 5 and 6 all only bite on production.**

## Combinations never tried together (each is one cheap test pass)
- Hobby ON / Thrift ON (owner: voice scripts still being built with Echo — not a blocker yet).
- Kiosk mode + Spanish; language flip mid-check.
- A zone check hitting a store someone has an alert on (now emails once — watch one).
- Two alerts on one store: guarded 07-31.
- **Texts (SMS): A2P approved, fee unpaid.** When it turns on, `smsAlerts` flips and a whole untested
  path opens: phone-contact alerts, `notifyContact`, the confirm-by-text flow.

## Reports to eyeball with real data
- The activity dashboard's zone-check counting shipped 07-27, never owner-confirmed.
- Admin "What a check costs" stays empty until a real charged check (by design).

**Verify-live output (paste on close):**
```
(none yet)
```
