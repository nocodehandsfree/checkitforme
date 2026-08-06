# docs/tasks/ — THE task queue (boot reads this file)

Boot ritual: pull staging → `docs/STATE.md` → your SYSTEM's checkpoint → THIS index → name the ONE task
you're taking. One task per session. Open the task file for the contract. Closing a task = status `done`
IN THE FILE with the `bash scripts/verify-live.sh` output pasted. No output, not closed. New task = one
small md here (what · done-when · system · status). Owner adds/reorders freely.

**Counts (swept 2026-08-04):** 76 task files in this folder (plus this index and the two 08-02 handoff notes). The tables below are the truth per task; the old 07-23 tally (60) is history.
Systems: site · admin · voice-calls · data · support (data carries the old ops/infra lane).

## ⭐⭐⭐ PM HANDOFF 08-02 night: `PM-HANDOFF-2026-08-02.md` — READ FIRST. First job: the report on
what changed about Charlie (the owner has it). The code rearrangement goes LAST, owner's ruling.

## ⭐⭐ THE ORDER OF EVERYTHING (08-02): `THE-ORDER-2026-08-02.md` — six agents in flight, one queue,
one merge at a time. READ IT FIRST. The law for Charlie: `docs/specs/charlie-behavior/README.md`.

## ⭐ THE VOICE PM LANE (Echo · handoff 08-01 · one PM chat, this lane ONLY — mapping has its own PM)
**Your first act: audit what Echo just built.** The law is `docs/team/voice-calls/check-life-audit-2026-08-01.md`
(84 deciders, 20 flagged, the four faults, the gatekeeper cure) + `RULES.md` #11 (a fix covers the
WHOLE family, one commit) and #12 (every prior run replays clean on the rig before the owner dials).
His work: branch `claude/echo-voice-transcript-ordering-9oi0es`, NOT merged, waiting on the owner's
"clear". He claims a gatekeeper (`src/calls/check-life.ts` + `check_life` table), all three families
rewired, three faults fixed, 103 rig checks. **VERIFY, do not trust:** send blind readers per family —
are ALL 20 flagged doors rewired through the gatekeeper (name each), do runs 222-226 replay clean,
does anything still ask ElevenLabs whether a check is alive, and is the `direct:` lane exception he
found sound? Report to the owner PASSED or FAILED per item, then the merge decision. History: three
agents in a row said "done" with 80% missing — mapper twice, Echo once. **Ship nothing without the
owner's "clear"; a push restarts staging and kills a live check.** Open after the merge: run 6 (his
phone, the ladder's first pass) · the hold hang-up timer (owner wants one, number undecided) · ONE
boxed Webbie string: the hold-drop "No charge" wording, EN + ES (owner ruled 08-01: a hold drop IS
charged) · mapping timing removal touches live checks — coordinate with the mapping PM before it ships.

## ⭐ THE MAPPING PM LANE (handoff 07-31 · the law: `docs/specs/mapping-admin/build-contract.md`,
addendum R1-R6 OVERRIDES the body · the fix list: `audit-code-vs-contract.md` in the same folder)
Mapping rebuild runs in THREE chunks, one fresh chat each: 1 engine (**FINISHED per the owner — the
PM's FIRST act is auditing it, blind readers vs the contract, then tell the owner PASSED or FAILED
per item so mapper starts round 2**) · 2 self-healing · 3 screens. Owner says "finished" → PM audits
that chunk vs the contract BEFORE the next chunk's box goes out. Voice-agent boot gate: any voice
task box lists the pre-reads (runtime spec §4 · RULES.md · checkpoint · listen-nav + bridge headers)
+ the team charter `handoff.md` (workflows · every Admin voice surface), and the agent must WRITE
BACK the life of one check in ten lines before touching code. Owner tests ONCE at the end (fresh CVS, start to finish). In the chunk-1
audit also re-prove run-resume on a live restart. After chunk 2, box Webbie ONE task: the zone-report
skip sentence for muted stores (EN + ES; the site is frozen to everyone else). Echo likely needs the
same spec-vs-build audit — wait for the owner's word. **PM ships NOTHING without the owner's "clear"
while he is testing — every push restarts staging and kills a live check.**

## ⭐ THE SITE LANE — handed off 08-06 (Webbie's chat closed; every item below is UNBUILT)
| Task | System | Status |
|---|---|---|
| [Auto-checks get their own section](site-auto-checks.md) | site | **NEXT.** Four screens. Only the list is approved; the report's picture is rejected twice and the owner named why (a ring reads as progress to a finish line, auto-checks run forever). Pictures + the owner's exact words: `docs/specs/auto-checks/README.md`. Also in this build: rename the "Manage Zones" row to "Zones", and fix the comp-account bug that hides the list from the owner's own account |
| [Go-live site audit: the fix list before customers](go-live-site-audit.md) | site | the bug list. Still open: production has never sent a single email (the confirm-your-email step, not the sender) · production is missing `ELEVENLABS_MIDCALL_AGENT_ID` and four other settings staging has · two calling-engine switches differ prod vs staging · a real auto-check has never been watched end to end · the untried combinations list |
| The alerts row switch wraps to a second line on a long store name | site | found + offered 08-05, the owner never gave a word on it. No task file yet |
| [Check history: a day tap shows that day's checks, not the newest one](site-history-day-list.md) | site | owner 08-06, to-do list, NOT boxed yet. Today `todayPickDay` opens the newest check and he waits for it to load; he wants the day list the check status page's calendar icon already shows (`railPickDay` → `.rday-list`) |

## ⭐ Repo + doc cleanup (08-05, owner-run folder by folder)
| Task | System | Status |
|---|---|---|
| [Doc sweep — the running list of things nobody could prove](doc-sweep-unknowns.md) | owner routes each line | open, growing |

## ⭐ Owner work streams (active — started this week)
**Stream 1 — the five site fixes (SHIPPED to staging @4f6c4a6, PR #92; owner confirms on his phone,
then they ride the next promote to prod):**
| Task | System | Status |
|---|---|---|
| [In-stock banner: owner on/off toggle](instock-banner-toggle.md) | site | shipped to staging |
| [Product types: per-product on/off flags (auto-hide the dropdown)](product-type-flags.md) | site | shipped to staging |
| [Back button must always return to the previous page](back-button-returns-previous.md) | site | shipped to staging |
| [Store name gets cut off on alert cards](alert-card-store-name-cutoff.md) | site | shipped to staging |
| [Zone checks do not update the activity dashboard](zones-checks-activity-dashboard.md) | site | shipped to staging |

**Stream 2 — the call/log investigation:**
| Task | System | Status |
|---|---|---|
| [Call log transcript comes back cut off](call-log-transcript-cutoff.md) | voice-calls | active |
| [Everything Staff says after a hold is missing](words-after-a-hold-are-lost.md) | voice-calls | active — found by the robot store 08-02, checks 246-251; a real yes was thrown away and one check told the customer the opposite of what Staff said. `node scripts/robot-check.mjs 5 6 8 9 10` proves the day it is fixed. |

**Stream 3 — the ops dashboard:**
| Task | System | Status |
|---|---|---|
| [The ops dashboard: build it on real checks](admin-ops-dashboard.md) | admin | active — THE next admin build |

**Stream 4 — the three boxes (owner, 07-29 · each is ONE chat, prompt = "Task: <file>. Boot."):**
| Task | System | Status |
|---|---|---|
| [The calling engine, round 2 (Echo)](echo-engine-round-2.md) | voice-calls | done 07-29 (staging LIVE; **PM: promote wanted**) |
| [Chain section rebuild — GO](../specs/mapping-admin/plan.md) | voice-calls + admin | active (un-parked 07-29) |
| [The Admin dashboard, continued (new Addie)](addie-dashboard-continue.md) | admin | **jobs 1+2 DONE 07-29** |
| [Voice ▸ Testing becomes the new-engine scorecard](admin-testing-new-engine.md) | admin | **SHIPPED 07-30** (@5b1f325, driven). Admin live · **PM: promote wanted** for the server half |
| [Check status page: the phone's own bars, then alerts](site-check-status-fixes.md) | site | rounds 1+2 **SHIPPED to staging 07-30** (PRs #100 #101: bottom clear on live AND wait screens, verdict at hang up; driven on staging by relay). Alerts + the no-email root cause SHIPPED 07-31. His phone next |
| [Go-live site audit: the fix list before customers](go-live-site-audit.md) | site | **findings gathered 07-31** (owner-ordered research, nothing built): short alerts sheet · slow radius reload · ES footer wrap · auto-check gaps · PROD alerts unproven · untried combos. Fixes wait for the owner's go |
| [Check status page: loud retry + headline states](site-check-status-loud-retry.md) | site | active — headline states + step window SHIPPED 07-30 (@ec6e2d0, staging). Loud retry + the counter still unbuilt |
| [Unify the Admin: gate FIRST, then page by page](admin-unify-pass.md) | admin | **step 1 (gate) + page 1 (Live/dash) DONE + LIVE 07-30, dash SEALED.** Next page = App (settings) |
| [The wrong-department save (Echo)](echo-wrong-department-save.md) | voice-calls | BUILT + shipped to staging 07-30 · all four items done · only a real check with a human saying "this is the pharmacy" is left, and that needs his phone |
| [Routes swap themselves at three stores (Mapper)](mapper-auto-swap.md) | voice-calls + admin | done 07-29 (screens LIVE; engine rides the promote) |

## Other open site fixes (consumer site is frozen: each needs an owner-named `.unlock`)
| Task | System | Status |
|---|---|---|
| [Admin: iOS bottom tint breaks on any slide-up](admin-glass-nudge.md) | admin | done 07-28 (LIVE @527a48f) |
| [Feature names stay English on the Spanish site](feature-labels-spanish.md) | admin | done 07-27 |
| [Reconcile COPY_CHANGES_APPROVED.md location](copy-changes-approved-reconcile.md) | site | active |
| [Alerts sheet formatting](alerts-sheet-formatting.md) | site | done 07-27 |
| [Logo fidelity in My Zones + call-log header](logo-fidelity-zones-calllog.md) | site | done 07-27 (owner confirmed) |

## ⏸ Parked (paused on purpose — owner-gated, blocked, or fires at a promote)
| Task | System | Status |
|---|---|---|
| [First promote after the rebuild — prod + admin LIVE in verify-live](first-promote-after-rebuild.md) | data | **done 07-30** (promote @731b21de; prod + admin serve it, health ok) |
| [One Admin, two environments: shell-level Live/Staging switch](admin-audit-env-switch.md) | data + admin | parked (owner-gated headline; scope with owner) |
| [Alerts can't actually send — launch blocker](admin-audit-alerts-providers-blocker.md) | data | parked (launch-critical; Twilio A2P APPROVED 07-30 — see the registration task; Brevo still open) |
| [Twilio texting registration — run the paid steps](twilio-a2p-registration.md) | data | parked (owner-gated: ~$20 once + $1.50/mo; fires on his go) |
| [Element catalog extraction (the long-term 888K shrink)](element-catalog.md) | site + admin | parked (owner-gated, big scope) |
| [Zone run on CVS/Walgreens since the engine rebuild](zones-cvs-walgreens-verify.md) | voice-calls | parked (real calls; owner listens) |
| [Real-card test (O1) — the owner's move](real-card-test.md) | owner | parked (blocked by staging-424; owner walks it) |

## ✖ Dead (closed — superseded)
| Task | Why |
|---|---|
| [Missing CD comps for data-heavy Admin pages](admin-cd-comps-data-pages.md) | superseded by `admin-audit-comps-missing.md` (covers the same pages + more) |
| [Stale admin browser test](e2e-admin-spec-stale.md) | browser tests archived 08-04, owner's ruling |
| [Zone-report browser test](e2e-zone-report-spec.md) | browser tests archived 08-04, owner's ruling |

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
| [Policy page overloaded — split per comp](admin-audit-policy-overload.md) | comp | admin | **DONE 07-29** |
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
| [Admin: double-tap zoom regression — fix morning 08-02, after logo lands, BEFORE the Echo test day](admin-double-tap-zoom-regression.md) | admin | active — owner-timed |
| [Pull 424 from staging ADMIN_PHONES before the real-card walk](staging-424-admin-phones.md) | data | active |
| [Staging store-list overwrite mystery](staging-storelist-overwrite.md) | data | active |
| [Settings mirror: verify prod export live](settings-mirror-verify.md) | data | active |
| [Retarget the stale CALL_ECONOMICS citation in server.ts](server-cost-citation.md) | data | active |

Consumer-site tasks need an owner-named unlock (the site is frozen — docs/shared/REBUILD_PLAN.md).
