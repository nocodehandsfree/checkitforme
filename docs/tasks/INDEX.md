# docs/tasks/ — THE task queue (boot reads this file)

Boot ritual: pull staging → your checkpoint → THIS index → say which task you're taking.
One task per session. Open the task file for the contract. Closing a task = status `done`
IN THE FILE with the `bash scripts/verify-live.sh` output pasted. No output, not closed.
New task = one small md here (what · done-when · lane · status). Owner adds/reorders freely.

| Task | Lane | Status |
|---|---|---|
| [First promote after the rebuild — prod + admin LIVE in verify-live](first-promote-after-rebuild.md) | Ops | open |
| [Store name gets cut off on alert cards](alert-card-store-name-cutoff.md) | Webbie | open |
| [Alerts sheet formatting](alerts-sheet-formatting.md) | Webbie | open |
| [Zone checks do not update the activity dashboard](zones-checks-activity-dashboard.md) | Webbie | open |
| [Missing CD comps for data-heavy Admin pages](admin-cd-comps-data-pages.md) | CD + Addie | open |
| [Element catalog extraction (the long-term 888K shrink)](element-catalog.md) | Webbie + Addie | open (owner-gated) |
| [Pull 424 from staging ADMIN_PHONES before the real-card walk](staging-424-admin-phones.md) | Ops | open |
| [Zone run on CVS/Walgreens since the engine rebuild](zones-cvs-walgreens-verify.md) | Echo (owner listens) | open |
| [Logo fidelity in My Zones + call-log header](logo-fidelity-zones-calllog.md) | Webbie | open |
| [Staging store-list overwrite mystery](staging-storelist-overwrite.md) | DD | open |
| [Settings mirror: verify prod export live](settings-mirror-verify.md) | Ops | open |
| [Prod gate 14/15: stale tests/e2e/admin.spec.ts](e2e-admin-spec-stale.md) | Addie | open |
| [Add the zone-report page to the e2e spec](e2e-zone-report-spec.md) | Ops | open |
| [Delete the dead pre-07-19 session branches on origin](origin-branch-cleanup.md) | Ops | open |
| [Real-card test (O1) — the owner's move](real-card-test.md) | Owner | blocked |
| [Retarget the stale CALL_ECONOMICS citation in server.ts](server-cost-citation.md) | Ops | open |
| [Reconcile COPY_CHANGES_APPROVED.md location](copy-changes-approved-reconcile.md) | Webbie | open |
| [Branch sweep — nothing stranded on a claude/* branch](branch-sweep.md) | Ops | open |
| [Doc census — every .md outside docs/archive: keep/fix/archive](doc-census.md) | Ops | open |
| [Admin cleanup: Live (godview › dash)](admin-cleanup-dash.md) | Addie | open |
| [Admin cleanup: Users (godview › users)](admin-cleanup-users.md) | Addie | open |
| [Admin cleanup: Restock (godview › restock)](admin-cleanup-restock.md) | Addie | open |
| [Admin cleanup: Alerts (godview › alerts)](admin-cleanup-alerts.md) | Addie | open |
| [Admin cleanup: Policy (godview › growth)](admin-cleanup-growth.md) | Addie | open |
| [Admin cleanup: Calc (godview › calc)](admin-cleanup-calc.md) | Addie | open |
| [Admin cleanup: Plans (godview › plans)](admin-cleanup-plans.md) | Addie | open |
| [Admin cleanup: Intel (stores › retailers)](admin-cleanup-retailers.md) | Addie | open |
| [Admin cleanup: Search (stores › search)](admin-cleanup-search.md) | Addie | open |
| [Admin cleanup: Add (stores › add)](admin-cleanup-add.md) | Addie | open |
| [Admin cleanup: Kiosk (stores › receipts)](admin-cleanup-receipts.md) | Addie | open |
| [Admin cleanup: Calls (calls › results)](admin-cleanup-results.md) | Addie | open |
| [Admin cleanup: Feedback (calls › feedback)](admin-cleanup-feedback.md) | Addie | open |
| [Admin cleanup: Statuses (calls › statuses)](admin-cleanup-statuses.md) | Addie | open |
| [Admin cleanup: Chains (calls › trees)](admin-cleanup-trees.md) | Addie | open |
| [Admin cleanup: App (calls › settings)](admin-cleanup-settings.md) | Addie | open |
| [Admin cleanup: Designer (voice › designer)](admin-cleanup-designer.md) | Addie | open |
| [Admin cleanup: Workflows (voice › workflows)](admin-cleanup-workflows.md) | Addie | open |
| [Admin cleanup: Testing (voice › testing)](admin-cleanup-testing.md) | Addie | open |
| [Admin cleanup: Fun (voice › fun)](admin-cleanup-fun.md) | Addie | open |
| [Admin cleanup: Chats (help › support)](admin-cleanup-support.md) | Addie | open |
| [Admin cleanup: Go-to-Market (launch › gtm)](admin-cleanup-gtm.md) | Addie | open |

## Admin audit findings (2026-07-23 · docs/team/admin/AUDIT.md)
One task per finding, tagged wiring / comp / copy / cut. Full context in AUDIT.md.

| Task | Tag | Lane | Status |
|---|---|---|---|
| [One Admin, two environments: shell-level Live/Staging switch](admin-audit-env-switch.md) | wiring | Ops + Addie | open (owner-gated) |
| [Policy/Plans/Statuses edit prod-first — staging-writable path](admin-audit-policy-plans-staging-write.md) | wiring | Ops | open |
| [Designer + Workflows write prod voice config — env picker never shipped](admin-audit-voice-config-prod-coupling.md) | wiring | Addie | open |
| [Store CRUD writes prod against the staging→prod sync](admin-audit-store-crud-prod-write.md) | wiring | DD | open |
| [Alert copy is prod-only — not mirrored to staging](admin-audit-alerts-not-mirrored.md) | wiring | Addie + Webbie | open |
| [Real prod calls with no staging rehearsal](admin-audit-realcall-no-rehearsal.md) | wiring | Ops + Echo | open |
| [Alerts diverges from its comp (CRUD vs LOG)](admin-audit-alerts-comp-diverge.md) | comp | Addie | open |
| [Policy page overloaded — split per comp](admin-audit-policy-overload.md) | comp | Addie | open |
| [No comp for Calc/Fun/Users/Search](admin-audit-comps-missing.md) | comp | CD + Addie | open |
| [Lane codenames + tuning jargon leak into the UI](admin-audit-lane-codenames-copy.md) | copy | Webbie + Addie | open |
| [Small Admin copy fixes (wrong toast, dev-speak, raw values)](admin-audit-copy-bugs.md) | copy | Webbie | open |
| [Policy flag labels should use real feature names](admin-audit-flag-names-real.md) | copy | Webbie | open |
| [Cut/hide Calc from the daily command center](admin-audit-cut-calc.md) | cut | Addie | open |
| [Retire or hide Go-to-Market at launch](admin-audit-cut-gtm.md) | cut | Addie + Ops | open |
| [Dead-code sweep across the Admin](admin-audit-dead-code-sweep.md) | cut | Addie | open |
| [Move dev diagnostics off daily operator surfaces](admin-audit-cut-dev-diagnostics.md) | cut | Addie | open |
| [Voice: consolidate overlapping edit surfaces + rehearsal engines](admin-audit-voice-overlap.md) | cut | Addie | open |
| [Alerts can't actually send — launch blocker](admin-audit-alerts-providers-blocker.md) | cut | Ops | open (launch-critical) |

Admin cleanup is one task per Admin page (22 pages from NAV_GROUPS). Consumer-site tasks
need an owner-named unlock (the site is frozen — docs/shared/REBUILD_PLAN.md).
