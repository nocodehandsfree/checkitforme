# docs/tasks/ — THE task queue (boot reads this file)

Boot ritual: pull staging → `docs/STATE.md` → your SYSTEM's checkpoint → THIS index → name the ONE task
you're taking. One task per session. Open the task file for the contract. Closing a task = status `done`
IN THE FILE with the `bash scripts/verify-live.sh` output pasted. No output, not closed. New task = one
small md here (what · done-when · system · status). Owner adds/reorders freely.

**Counts (swept 2026-07-23):** active 50 · parked 6 · dead 1 · total 57.
Systems: site · admin · voice-calls · data · support (data carries the old ops/infra lane).

## ⭐ Owner work streams (active — started this week)
**Stream 1 — site fixes (the five, consumer site is frozen: each needs an owner-named `.unlock`):**
| Task | System | Status |
|---|---|---|
| [Store name gets cut off on alert cards](alert-card-store-name-cutoff.md) | site | active |
| [Alerts sheet formatting](alerts-sheet-formatting.md) | site | active |
| [Zone checks do not update the activity dashboard](zones-checks-activity-dashboard.md) | site | active |
| [Logo fidelity in My Zones + call-log header](logo-fidelity-zones-calllog.md) | site | active |
| [Reconcile COPY_CHANGES_APPROVED.md location](copy-changes-approved-reconcile.md) | site | active |

**Stream 2 — the call/log investigation:**
| Task | System | Status |
|---|---|---|
| [Call log transcript comes back cut off](call-log-transcript-cutoff.md) | voice-calls | active |

## ⏸ Parked (paused on purpose — owner-gated, blocked, or fires at a promote)
| Task | System | Status |
|---|---|---|
| [First promote after the rebuild — prod + admin LIVE in verify-live](first-promote-after-rebuild.md) | data | parked (fires at the owner's promote) |
| [One Admin, two environments: shell-level Live/Staging switch](admin-audit-env-switch.md) | data + admin | parked (owner-gated headline; scope with owner) |
| [Alerts can't actually send — launch blocker](admin-audit-alerts-providers-blocker.md) | data | parked (launch-critical; blocked on Twilio A2P + Brevo) |
| [Element catalog extraction (the long-term 888K shrink)](element-catalog.md) | site + admin | parked (owner-gated, big scope) |
| [Zone run on CVS/Walgreens since the engine rebuild](zones-cvs-walgreens-verify.md) | voice-calls | parked (real calls; owner listens) |
| [Real-card test (O1) — the owner's move](real-card-test.md) | owner | parked (blocked by staging-424; owner walks it) |

## ✖ Dead (closed — superseded)
| Task | Why |
|---|---|
| [Missing CD comps for data-heavy Admin pages](admin-cd-comps-data-pages.md) | superseded by `admin-audit-comps-missing.md` (covers the same pages + more) |

## Admin cleanup — one task per Admin page (22, all active · ship via `scripts/ship-admin.sh`)
Live [dash](admin-cleanup-dash.md) · Users [users](admin-cleanup-users.md) · Restock
[restock](admin-cleanup-restock.md) · Alerts [alerts](admin-cleanup-alerts.md) · Policy
[growth](admin-cleanup-growth.md) · Calc [calc](admin-cleanup-calc.md) · Plans
[plans](admin-cleanup-plans.md) · Intel [retailers](admin-cleanup-retailers.md) · Search
[search](admin-cleanup-search.md) · Add [add](admin-cleanup-add.md) · Kiosk
[receipts](admin-cleanup-receipts.md) · Calls [results](admin-cleanup-results.md) · Feedback
[feedback](admin-cleanup-feedback.md) · Statuses [statuses](admin-cleanup-statuses.md) · Chains
[trees](admin-cleanup-trees.md) · App [settings](admin-cleanup-settings.md) · Designer
[designer](admin-cleanup-designer.md) · Workflows [workflows](admin-cleanup-workflows.md) · Testing
[testing](admin-cleanup-testing.md) · Fun [fun](admin-cleanup-fun.md) · Chats
[support](admin-cleanup-support.md) · Go-to-Market [gtm](admin-cleanup-gtm.md)

## Admin audit findings (2026-07-23 · docs/team/admin/AUDIT.md) — one task per finding
| Task | Tag | System | Status |
|---|---|---|---|
| [Policy/Plans/Statuses edit prod-first — staging-writable path](admin-audit-policy-plans-staging-write.md) | wiring | data | active |
| [Designer + Workflows write prod voice config — env picker never shipped](admin-audit-voice-config-prod-coupling.md) | wiring | admin | active |
| [Store CRUD writes prod against the staging→prod sync](admin-audit-store-crud-prod-write.md) | wiring | data | active |
| [Alert copy is prod-only — not mirrored to staging](admin-audit-alerts-not-mirrored.md) | wiring | admin + site | active |
| [Real prod calls with no staging rehearsal](admin-audit-realcall-no-rehearsal.md) | wiring | data + voice-calls | active |
| [Alerts diverges from its comp (CRUD vs LOG)](admin-audit-alerts-comp-diverge.md) | comp | admin | active |
| [Policy page overloaded — split per comp](admin-audit-policy-overload.md) | comp | admin | active |
| [No comp for Calc/Fun/Users/Search](admin-audit-comps-missing.md) | comp | CD + admin | active |
| [Lane codenames + tuning jargon leak into the UI](admin-audit-lane-codenames-copy.md) | copy | site + admin | active |
| [Small Admin copy fixes (wrong toast, dev-speak, raw values)](admin-audit-copy-bugs.md) | copy | site | active |
| [Policy flag labels should use real feature names](admin-audit-flag-names-real.md) | copy | site | active |
| [Cut/hide Calc from the daily command center](admin-audit-cut-calc.md) | cut | admin | active |
| [Retire or hide Go-to-Market at launch](admin-audit-cut-gtm.md) | cut | admin | active |
| [Dead-code sweep across the Admin](admin-audit-dead-code-sweep.md) | cut | admin | active |
| [Move dev diagnostics off daily operator surfaces](admin-audit-cut-dev-diagnostics.md) | cut | admin | active |
| [Voice: consolidate overlapping edit surfaces + rehearsal engines](admin-audit-voice-overlap.md) | cut | admin | active |

## Other active
| Task | System | Status |
|---|---|---|
| [Pull 424 from staging ADMIN_PHONES before the real-card walk](staging-424-admin-phones.md) | data | active |
| [Staging store-list overwrite mystery](staging-storelist-overwrite.md) | data | active |
| [Settings mirror: verify prod export live](settings-mirror-verify.md) | data | active |
| [Prod gate 14/15: stale tests/e2e/admin.spec.ts](e2e-admin-spec-stale.md) | admin | active |
| [Add the zone-report page to the e2e spec](e2e-zone-report-spec.md) | data | active |
| [Retarget the stale CALL_ECONOMICS citation in server.ts](server-cost-citation.md) | data | active |

Consumer-site tasks need an owner-named unlock (the site is frozen — docs/shared/REBUILD_PLAN.md).
