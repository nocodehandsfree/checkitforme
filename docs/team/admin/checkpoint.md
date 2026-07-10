# Check - Admin — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## 2026-07-10 session (owner's 8-call feedback) — SHIPPED to staging, awaiting owner live test

**THE finding:** all 8 of the owner's 07-09 calls ran CHARLIE, not Delta. Two reasons:
(1) they hit the OLD pre-repo-split staging deploy, and (2) the LIVE check path
(`bridgeStoreCall`, what the site's Check button uses) never looked at `workflow.lane` at all —
only `triggerCall` did. Delta is STILL un-live-tested. Fixed + shipped (f61bed2):
- check-live now routes lane:delta stores to the D-lane; synthetic id `delta:<session>` doubles as
  room + conversation id → /pub/bridge, /pub/live, /pub/result + the listen WebSocket all follow a
  Delta call. Charlie barge-in reuses the same room, /pub/live proxies EL after a barge.
- EL poller (`ingestPending`) skips `delta:` ids; Delta finalize still writes the verdict.
- **NEXT OWNER TEST = the real first Delta live test.** Watch for: opener timing, set follow-up
  ("Chaos Rising" example), tin/packs on unknown set, hello-nudge on silence, barge-in on off-script.

**Voice tuning shipped (both lanes):** no dashes in ANY spoken line (Charlie prompt rule + de-dashed
examples; Delta defaults were clean) · set question always gives an example set name · unknown set →
ask "booster packs or a tin?" instead of ending · restock-day ask also fires on "restock coming soon"
and pushes once for the specific day (elevenlabs.ts ask_shipment_day) · dead-quiet pickup → agent says
"Hello?" (Charlie prompt rule; Delta = new clip 7 nudge) · Delta pre-opener wait 8s→3s (dead-air fix) ·
classifier + verdict pass map "three packs in one" → 3-pack blister.

**Verdict/productDetail fix:** decisive in-stock calls now run the extraction second-read too (verdict
untouched — extraction only), so set + product form land in productDetail (was null on ALL 8 calls).

**checkit.html live view (shipped):** pending verdict = neutral GRAY "Getting result…" (new `pend`
tone; never yellow unclear) · "Restock confirmed · soon" drops the generic suffix (keeps "· Tuesday") ·
Twilio answered signal flips "We've connected" immediately.
**⚖️ SETTLED — timeline rail STAYS (owner ruling 07-10, do not re-flatten):** I read call 8's "no
indenting" as "remove the rail" and cut the whole vertical timeline; the owner immediately asked where
it went and Webbie restored it (e34d72b). The call-8 flat-log reading is DEAD. qa-behaviors asserts
the rail dots again (4dc3250). Any future "flatter" ask needs the owner's explicit words + screenshot.

**Alert emails (42768ed):** renderBrandedEmail rebuilt to Design's approved mock — #08090D board,
wordmark image, gradient card w/ solid Outlook fallback, Inter-black headline (serif was wrong),
filled capsule CTA w/ white label + VML roundrect for Outlook, mock-accurate modules. Two test emails
SENT to owner (welcome + store_added) from staging (BREVO_API_KEY copied prod→staging via Railway).
**NOT verified: actual Outlook rendering — owner must open the test in Outlook.** Restock-as-EMAIL has
no test path (restock is SMS-channel in sendTestAlert) — small follow-up if owner wants to see E3.

**SMS / A2P prep:** creds present both envs (TWILIO_SMS_FROM set; code auto-prefers
TWILIO_MESSAGING_SERVICE_SID when set). Approval-day runbook: if A2P lands on a Messaging Service,
set TWILIO_MESSAGING_SERVICE_SID in Railway → Admin → God View → Alerts → test "restock" to owner
phone → confirm delivery in Twilio console (error 30034 = A2P not active yet). Delivery chips +
send log already on the Alerts tab.

**Admin (cbc2928):** Feedback tab now has an "Unclear checks" pill strip from the unfiltered
/api/results (Fun included; god-view headline filter untouched) · Schedules nav tab deleted
(section was already gone). app.html verified: </script>=2, node --check OK.

**Tests:** tsc 0 errors · 18/18 delta units green · qa-behaviors green (assertions updated to the flat
log) · qa-round6 / qa-gating / qa-admin-plans fail IDENTICALLY on the pre-session baseline 93d19c1
(legacy failures, already attributed by DevOps — not from this session).

**Known edge (accepted):** a BARGED Delta call reopened from history >15 min later (after the
in-memory session expires) can't resolve `delta:<id>` → shows in_progress. Rare, owner-facing only.

**OPEN (priority order):**
1. Owner runs the next Fun test round → THE first real Delta live test (incl. barge-in on an
   off-script call). Tune again from that feedback.
2. Owner confirms the test emails in OUTLOOK match docs/design/emails/ mock.
3. A2P approval day → SMS end-to-end per runbook above.
4. 🅿️ Premium-feature TOGGLE MATRIX in God View → Plans (qa-admin-plans failures live here —
   backend done, matrix UI missing/regressed).
5. Workflows env picker Prod|Staging (one Admin powers both; cross-origin auth w/ DevOps).
6. Per-customer account view (spec docs/specs/admin-user-view.md; DevOps builds endpoints).
7. Remove Admin "Zones" area (~30 refs in app.html); engine/tables stay.
8. Dashboard hero 5→3 vitals (Checks 24h · Reach 30d · EL credits) · Chains page roll-up control ·
   call-metrics brief items 2-3 (per-chain metrics + model-routing audit in Admin) · Delta write-up
   into CHEAP_NAV_ARCHITECTURE.md (call-metrics brief item 5).

**Delegated (track):** Data Dev — null stale avgTreeSeconds on ~30 direct chains. Mapping — 13
"attempted" re-runs. **Do not chase:** owner's laptop Safari stuck on old staging design (cache).
