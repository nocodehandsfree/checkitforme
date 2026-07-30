# Unify the Admin — the gate FIRST, then one page per session

**System:** admin · **Status:** active — starts AFTER the Testing scorecard task
(`admin-testing-new-engine.md`); one agent in `app.html` at a time.
**Why (owner, 07-29):** six agents have tried a whole-Admin cleanup and every one died mid-pass.
This attempt is different the same way the rebuild was: the rules become a MACHINE GATE before any
page is touched, so a cleaned page can never rot back.

**Step 1 — build `scripts/qa-admin-unify.mjs` (the gate) BEFORE touching any page.** It fails when
a page has any of:
- more than ONE info-icon pattern (pick the standard from the comp board; every `data-tip` uses it);
- on-page directional copy ("click here to…", "use this to…") — that text belongs in a tooltip;
- a named list of UNTRUE lines the owner has called out, seeded from: any label implying Delta
  runs today · Clerk sign-up references · "estimated" wording on a number we now sum from real
  checks. Keep the banned list IN the script, commented, so it grows.
Wire it into the ship path like `qa-admin-glass`. Prove it fails on today's Admin, then start.

**Step 2 — page by page, ONE per session,** in this order: Live (dash) · App (settings) · Calc ·
the rest per `docs/tasks/INDEX.md` cleanup list. Each page: gate green · driven at 390px · copy per
`COPY_STYLE_GUIDE_ADMIN.md` (his words: a check · Staff · dropped/reconnected Charlie · nav time ·
talk time — never receipt/room/lane/"the thinking").

**Ride-alongs the owner named (07-29), fold into the matching page's session:**
- Dashboard: the baseline line — today 5.3¢ direct / ~8.5¢ worst menu, ceiling 6.6¢ (⅓ of the
  cheapest plan's per-check revenue = his 67% margin floor). Retire the old meters: Call time and
  Call health cards (replaced by the new cost drills), the ElevenLabs credits card (not worth a
  card at $22/mo). Verify "checks left" math while there.
- App (Calls ▸ App): every knob gets a plain sentence or moves. The hold-wait knob reads
  "How long we wait on hold before giving up: 60s". Reconcile the web-analytics ID against PostHog
  (it may be the PostHog key wearing a bad name — check, don't guess; owner never asked for it).
- Calc: the plan curve is wrong (price per check must fall as tiers rise) and its baseline becomes
  the REAL stamped average, forecast only extrapolates from it.

**Done when (per page):** gate green on that page · driven · verify-live pasted here with the page
named. The task closes when every page in the cleanup list has had its pass.

**Verify-live output (paste per page — a page without it is NOT done):**
```
(none yet)
```
