# docs/tasks/ — THE task queue (boot reads this file)

Boot ritual: pull staging → your checkpoint → THIS index → say which task you're taking.
One task per session. Open the task file for the contract. Closing a task = status `done`
IN THE FILE with the `bash scripts/verify-live.sh` output pasted. No output, not closed.
New task = one small md here (what · done-when · lane · status). Owner adds/reorders freely.

| Task | Lane | Status |
|---|---|---|
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

Admin cleanup is one task per Admin page (22 pages from NAV_GROUPS). Consumer-site tasks
need an owner-named unlock (the site is frozen — docs/shared/REBUILD_PLAN.md).
