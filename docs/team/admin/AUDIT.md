# Admin audit — wiring · comps · copy · what to cut (2026-07-23)

Read-only audit of the whole Admin (`public/app.html`, 22 pages). Nothing was changed.
Goal we measured against: **ONE Admin that can manage staging and production side by side,
where building in Admin never forces a production change.** Plain language, one section per page.

## How the plumbing actually works (read this first)
- **The Admin you use IS production.** `admin.checkitforme.com` is the live prod service
  (`scripts/ship-admin.sh` ships the page straight to it). So the normal fetch helper `api(...)`
  always talks to prod — every read shows prod data, every save writes prod, live for customers
  the instant you tap it.
- **One toggle can point a page at staging** (`srcApi` + the "Live site / Staging site" dropdown).
  It exists on **only 4 pages**: Users, Feedback, Testing, Chats. It's a single shared switch —
  flipping it on one of those pages flips all four. Every other page has no such switch.
- **Two automatic pipes blur the line:**
  - *Settings mirror* copies pricing, plans, statuses and the support banner **one way, prod → staging**,
    every minute. So editing those in Admin is a prod write that staging quietly copies — you can't
    preview them on staging first.
  - *Store sync* copies chains/stores **staging → prod**. So staging is the source of truth for store
    data — but Add/Search write stores straight to prod, against the flow.
- **Voice/workflow settings are in neither pipe.** Editing them in Admin changes prod's live call
  config, and staging never follows. The code comment literally calls "the Admin env-picker the
  future answer" — it was never built.

**Scoreboard: 18 of 22 pages are hard-wired to production. 4 can see staging.**

---

# GOD VIEW

## Live (dash) — prod-only
- **Wiring:** All prod reads (`/api/admin/overview`, `/metrics`, `/restock-intel`, `/credits`,
  `/call-timing`, `/pulse`, `/calls-audit`). Two prod writes hidden in sheets: set the credit-limit
  (`PATCH /api/settings`) and "Start fresh" which resets the real-call stat baseline
  (`POST /api/admin/stats-since`). Refreshes every 12s. No staging view.
- **Comp:** Matches the LIVE comp (1b) — hero number, vitals, peek rows into reports. Good.
- **Copy:** Plain and good. One leak: the Call-health tile says "dup ingests" — dev-speak.
- **Worth it:** The Call-health report (audit + purge dry-run) is a data-hygiene tool, out of place
  in a daily command center. The Money sheet duplicates the Calc page.

## Users — **staging-aware** ✅
- **Wiring:** The one God-View page on the Live/Staging toggle. Read `/api/admin/users`; writes
  (reset account — cancels Stripe subs; mark admin/test) follow the toggle, so account resets can be
  rehearsed on staging. This page already meets the goal.
- **Comp:** No dedicated comp; sits between the list and CRUD grammars. On-pattern.
- **Copy:** Clean, real terms.
- **Worth it:** Fine. Legit ops tools.

## Restock — prod-only, read-only
- **Wiring:** Reads `/api/admin/restock-intel` + per-store drill-in. No writes, no staging view.
  Shows "nothing learned yet" until real prod calls exist.
- **Comp:** Matches the REPORT comp (1g). Good.
- **Copy:** Strong and plain.
- **Worth it:** Heavy multi-drill report that's empty before launch. Duplicates the "intel" block on
  the Policy page (same data source).

## Alerts — prod-only
- **Wiring:** Reads/writes prod. Editing a customer message writes `alerts_json`, which is **not** in
  the settings mirror — so alert copy is prod-only and staging never follows. Test-send fires a real
  text/email — but delivery is **stubbed** today (Twilio A2P not cleared, Brevo key unset).
- **Comp:** Supposed to be a LOG (1c) but built as a CRUD list with the send-log folded in. Diverges.
- **Copy:** "Stubbed" leaks dev-speak — should read "test only / not delivered."
- **Worth it:** **No alert can actually send at launch** until the providers are live. Launch blocker.

## Policy (growth) — prod-only, **worst coupling**
- **Wiring:** Reads a pile (`/api/policy`, plans mirror, pulse, intel, kiosks, watches, community,
  waitlist, store-requests). Writes flags and pricing (`PATCH /api/policy` → `policy_json`), plus
  community moderation, store-request status, and a real waitlist-email blast. **`policy_json` is
  mirrored one-way prod → staging**, so every flag/price change here is a prod write with no
  staging-first preview — the clearest violation of the goal.
- **Comp:** The comp says split it (flags = console, queues = logs); the code does that — then bolts
  on pricing, a plans mirror, pulse, and intel, overloading the page.
- **Copy:** Mostly plain. Leaks: raw "GA4 measurement id" and "Finds headstart (min)". Feature-flag
  labels should match real consumer feature names (e.g. the score-posting feature is **"Post Your
  Score"**, not a made-up flag word).
- **Worth it:** Overloaded — Pulse duplicates Live's Members, intel duplicates Restock, kiosks
  duplicate the Kiosk tab. Three blocks already live elsewhere.

## Calc — prod-read-only, **cut candidate**
- **Wiring:** A client-side cost calculator; changes nothing. Only call is a prod read of the plan
  ladder for the ROI math.
- **Comp:** No comp, and by design fits none of the five page types. It's a sandbox.
- **Copy:** Heavy internal codenames — "Alpha keypad / Bravo voice-menu / Charlie agent / Delta
  recorded." None are customer feature names.
- **Worth it:** An internal unit-economics toy holding a top-level daily tab, overlapping Live's Money
  sheet. Strongest cut/hide candidate for launch.

## Plans — prod-only (+ real money)
- **Wiring:** Read `/api/admin/plans`; edits auto-save a draft that's live on the site immediately
  (`vt_plans`, also mirrored prod → staging); **Publish creates real Stripe prices**. No staging path.
- **Comp:** Matches the CRUD comp (1e). Good.
- **Copy:** Clean, owner-known terms.
- **Worth it:** Core and legit. Caution: auto-save writes prod drafts instantly and Publish is a
  real-money action with no rehearsal path.

---

# STORES

## Intel (retailers) — prod-only, read-only
- **Wiring:** Reads `/api/admin/store-intel` + `/coverage`. No writes, no staging view — you can't see
  staging's store counts from here.
- **Comp:** Matches the REPORT comp (1g). Good.
- **Copy:** "MSRP coverage" and its long tip are inside-baseball. Trim the tip.
- **Worth it:** Fine; some reports marginal but cheap.

## Search — prod-only, **writes stores + real calls**
- **Wiring:** Reads `/api/retailers`. Writes go straight to prod: demo-store phone
  (`PATCH /api/retailers/:id`), per-store workflow (`PATCH /api/settings`). Card tap places a **real
  prod call** (`/api/call-now`) with live transcript. **Coupling:** store edits hit prod directly,
  but store-sync treats **staging as the source** for the store table — so these edits fight the pipe
  and a later sync can clobber them.
- **Comp:** No dedicated comp — a list-plus-action surface. Reasonable.
- **Copy:** Real and clean.
- **Worth it:** Dead code: `refreshHours` and `backfillAllHours` have no callers (the latter would
  re-load 100k stores every 8s). Cut.

## Add — prod-only, **sharpest data footgun**
- **Wiring:** Creates/edits stores straight in prod: single add (`POST /api/retailers`), bulk JSON
  import (`POST /api/stores/import` — **deactivates any store not in the payload**, a full-replace
  footgun), backfill-regions. Store-sync is staging → prod, so building here forces a prod update the
  pipe is meant to own, and the next sync can overwrite or wipe Admin-added stores.
- **Comp:** Matches the CRUD comp (1e).
- **Copy:** Bug — an import failure shows "Couldn't backfill the regions" (wrong, copy-pasted).
- **Worth it:** Bulk import + backfill are data-dev tools, not owner-daily; the deactivate-on-import
  behavior against prod is dangerous. Hide/guard for launch.

## Kiosk (receipts) — prod-only, read-only
- **Wiring:** Reads receipts + machines + an inbox-debug dump of the receipts Gmail. No writes.
- **Comp:** Matches the Kiosk comp (2d). Good.
- **Copy:** Real terms; leaks the raw address `restocktimer@gmail.com`.
- **Worth it:** The Inspect-inbox raw-email dump is a developer diagnostic. Hide for launch.

---

# CALLS

## Calls (results) — prod-only, read-only
- **Wiring:** Reads `/api/results` only. No staging view — you can't see staging calls here.
  Filters are client-side.
- **Comp:** Matches the LOG comp (1c). Clean.
- **Copy:** Real, plain.
- **Worth it:** Fine. Only gap: no source toggle.

## Feedback — **staging-aware** ✅
- **Wiring:** On the Live/Staging toggle; reads and writes (correct verdict / mark reviewed) follow
  the source, and the tab badge is correctly pinned to Live so staging browsing won't repaint it.
  This is the model the other pages should copy.
- **Comp:** Matches the LOG comp (1c). Solid.
- **Copy:** Real terms.
- **Worth it:** Slight overlap with the Calls log, but justified. Keep.

## Statuses — prod-only (mirrored)
- **Wiring:** Read/add/edit the verdict registry (`/api/statuses`). Every edit is a prod write to a
  table that's mirrored prod → staging, so staging follows automatically (acceptable). Edits are live
  in the customer app instantly. **No delete handler exists** — a bad status can't be removed in the UI.
- **Comp:** Matches the CRUD comp (1e).
- **Copy:** Honest and real.
- **Worth it:** `saveStatus` looks dead (edits auto-save instead). Missing delete is a real gap.

## Chains (trees) — prod-only, **real calls + real money**
- **Wiring:** Reads chains + mapper/trainer state. Writes chain settings and store bulk-patches to
  prod. Mapping runs against **prod store data and places real phone calls** (12/day cap). No staging
  rehearsal path — every action is prod-live and spends real call budget. (Engine stays frozen;
  actions go through the guarded trainer/mapper endpoints.)
- **Comp:** Matches the long-list comp (2e). Good.
- **Copy:** Alpha/Bravo/Charlie/Delta lane codenames appear, but demoted to a glossed footnote —
  acceptable.
- **Worth it:** Dense but each control earns its place. Launch risk is real-call cost with no
  rehearsal.

## App (settings) — prod-only
- **Wiring:** "Customers hear calls live" toggle and raw-JSON policy editor write prod flags
  (`/api/policy`); default-workflow writes `/api/settings` (not mirrored, so staging keeps its own).
  No staging view.
- **Comp:** Matches the CONSOLE comp (1i). Good.
- **Copy:** Plain and real.
- **Worth it:** `loadSettings` + `toggleVoicemail` drive a `vmToggle` that isn't on this page —
  dead weight loaded every time. Cut.

---

# VOICE

## Designer — prod-only, **worst coupling (voice)**
- **Wiring:** Every save writes prod's live call config with no staging path and mostly no confirm:
  set live voice (`/api/voices/active` — changes what real calls sound like, no confirm), openers,
  personas, workflows, voice pool (all `PATCH /api/settings` → `vt_*`), clone a voice, "apply draft
  to all stores." The test bench places **real calls to the owner's phone.** Because `vt_*` is
  excluded from the mirror, staging never follows — there's currently no way to build/tune a workflow
  without mutating prod.
- **Comp:** Matches the CRUD-wizard comp (2c).
- **Copy:** Most jargon of any page — "Charlie / Delta" lanes, "Beat," "Naturalness," "tapedeck,"
  "bench," "soft-timeout."
- **Worth it:** Very dense and duplicative — the rotation step duplicates Workflows, the test bench
  duplicates Fun. Cut candidates: the voice-model dropdown (Turbo/Flash), "Naturalness," soft-timeout.

## Workflows — prod-only, **worst coupling (voice), env picker never shipped**
- **Wiring:** Every workflow/opener/voice/persona/default/lane edit auto-saves to prod
  (`PATCH /api/settings` → `vt_*`), no confirm except delete. **The Prod/Staging env picker the
  checkpoint calls "half done" is 0% in the shipped code** — there's no toggle here at all. Staging
  never follows. Sharpest coupling alongside Designer.
- **Comp:** Matches the CRUD comp (1e) exactly — including that the comp *draws* an env track this
  page doesn't have.
- **Copy:** Lane codenames again; otherwise plain.
- **Worth it:** The same workflow is editable both here and in Designer (with a button that
  round-trips out to Designer for tuning). Two edit surfaces for one thing is confusing.

## Testing — **staging-aware** ✅
- **Wiring:** On the Live/Staging toggle; read-only call log, no writes, no call trigger. Proves the
  pattern the write-heavy Voice pages lack. (Caveat: the toggle is the shared global one.)
- **Comp:** Matches the Testing comp (2b). Good.
- **Copy:** Clean, icon status chips.
- **Worth it:** Lean, single-purpose. Only gap: can't place a call itself — points the owner to Fun.

## Fun — prod-only (call-trigger only)
- **Wiring:** Two rehearsal cards that place **real calls to the owner's own phone** (never a store),
  writing no config. Safe from a config standpoint, but always real Twilio calls from prod.
- **Comp:** No comp (owner sandbox), as expected.
- **Copy:** "Charlie / Delta rehearsal" are the card titles; "barge-in," "handoff"; a
  Professional/Homie/Family personality list that diverges from Designer's persona system.
- **Worth it:** Overlaps Designer's test step but through a *different* engine and a *second*
  personality model. Two rehearsal paths = muddy.

---

# HELP + LAUNCH

## Chats (support) — **staging-aware** ✅ (with a catch)
- **Wiring:** On the Live/Staging toggle; reads (stats, chats, credits) and writes (mark resolved,
  teach an approved answer) **both** follow the toggle. Catch: there's no per-action label, so with the
  toggle in its default "Live" spot, every mark-resolved / teach silently trains **prod** — the
  operator has to read the global dropdown to know which brain they just taught.
- **Comp:** Matches the LOG/report comp (1c/1g). Good.
- **Copy:** Clean. Minor: an invented "Tier 1 / Tier 2 / Human email" label set.
- **Worth it:** `supReindex` ("Update from the book") is dead code — no button calls it. The
  "Pending review · N" pill counts a queue with no screen behind it. The 3-tier label is overkill.

## Go-to-Market (gtm) — prod-only, **retire at launch**
- **Wiring:** All prod. Every tick/add/delete saves the whole checklist to a prod-only settings key
  (`gtm_checklist`); no staging view, not synced. Harmless internal state, but fully prod-coupled.
- **Comp:** Matches the Launch-checklist comp (2a). Good.
- **Copy:** Uses owner-facing role words (not internal nicknames) — no leak. But the 11-way
  "who's assigned" agent taxonomy is build-team framing with no audience but the owner.
- **Worth it:** A pre-launch build tracker. Once launched it's a static "all done" board. Strong
  candidate to retire or hide behind an internal flag. The agent/area filters are project-management
  overkill for a solo owner.

---

# COUPLING MAP (the honest picture)

**Only 4 of 22 pages can see or touch staging:** Users, Feedback, Testing, Chats — and they share one
global switch, built for *viewing* rehearsal data, not for building.

**The other 18 are hard-wired to production.** Grouped by how bad:

1. **Prod writes you can't preview (mirrored one-way):** Policy (flags/pricing), Plans (+ real
   Stripe), Statuses. Editing these literally forces a prod change; staging copies it a minute later.
2. **Prod voice config, no staging path, not even mirrored:** Designer, Workflows, App, Alerts.
   Building a workflow or editing a customer message mutates prod live and staging never follows.
   The env picker that would fix Workflows was never shipped.
3. **Store data written to prod against the sync flow:** Search, Add. Staging is the source of truth
   for stores, yet these write prod directly — and import can deactivate/wipe rows.
4. **Real calls / real money, no rehearsal:** Chains (mapping), Search (call-now), Designer (bench),
   Fun (owner calls), Plans (Publish). These legitimately stay prod, but there's no staging dry-run.
5. **Read-only but prod-blind:** Live, Restock, Intel, Kiosk, Calls — you can't see staging's numbers.

**What the one-Admin-two-environments fix takes (rough):** The pattern already exists — the toggle on
4 pages, and the CRUD comp already *draws* an env track. The fix is additive, not new architecture:
(1) promote the scattered per-page toggle to ONE visible environment switch in the shell that every
page's reads and writes honor; (2) extend the staging fetch path to the other 18 pages; (3) give the
mirrored settings (policy/plans/statuses) and the unmirrored ones (voice/workflows/alerts) a
staging-writable path so you build on staging then promote, instead of the current prod-first mirror;
(4) keep real-call and Stripe actions prod-gated. Safe to do page-by-page — Feedback/Testing/Support/
Users already prove it works.

---

# TLDR (10 lines)
1. The Admin you use is production — 18 of 22 pages write straight to prod, live for customers the
   instant you tap. Only 4 (Users, Feedback, Testing, Chats) can see staging.
2. So today, **building in Admin almost always forces a prod change.** That's the core problem.
3. Worst 3 pages: **Workflows** (edits prod voice live, the promised staging picker was never built),
   **Designer** (flips the live-call voice with no confirm, densest, most jargon), **Policy** (flags
   and pricing write prod first, then mirror to staging — no preview).
4. Runner-up danger: **Add** can overwrite/wipe prod stores via bulk import, against the store pipe.
5. **Alerts can't actually send yet** (SMS/email providers not live) — a real launch blocker.
6. Comps: most pages match; **Alerts** and **Policy** diverge/overload; **Calc, Fun, Users, Search**
   have no comp.
7. Copy: lane codenames (Alpha/Bravo/Charlie/Delta) and tuning jargon leak into Calc/Designer/Fun;
   small bugs (Add's wrong toast, "Stubbed", raw GA4/email); flag labels should use real names.
8. Cut candidates for launch: **Calc** and **GTM** (internal tools on daily tabs), plus dev diagnostics
   (dash Call-health, Add bulk-import, Kiosk inbox-dump) and a pile of dead code.
9. The fix is not new architecture — it's promoting the existing 4-page toggle to one shell-level
   Live/Staging switch every page honors, plus a staging-writable path for settings. Additive,
   page-by-page.
10. Rough size: medium-large but incremental and low-risk; Feedback/Testing/Support/Users already
    prove the pattern works. No fixes made this session — findings filed as tagged tasks.
