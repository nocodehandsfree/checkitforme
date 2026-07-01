# Admin overhaul — QA test harness

> Hand to QA **after** Admin ships. **How our environment works (per DevOps, current):** there is **ONE Admin — `admin.checkitforme.com`** (internal, owner-only, reads live prod data). **There is NO staging** — `staging.checkitforme.com` was retired and is dead. There is no "verify on staging then promote" step: **what's live is what ships.** So **QA verifies directly on `admin.checkitforme.com`** (and consumer copy on `checkitforme.com`) — a rough edge caught here is fine, no customers see the admin. Each row: do the action, confirm the expected result. Mark PASS/FAIL.
> ⚠️ If you see this header say "staging-first," it was reverted in error — the line above is the current truth (DevOps killed staging). Do not send QA to `staging.checkitforme.com`.
> **Specs:** `voice-caller/docs/design/ADMIN_UI_AUDIT.md` (the punch list) · `voice-caller/docs/design/STYLE_GUIDE.md` §3 (the type/size/color authority — Design's) · `voice-caller/docs/business/COPY_STYLE_GUIDE.md` (voice) · `voice-caller/docs/design/COPY_ADMIN_MASTER.md` (copy sweep).

## 1. The two bugs (must pass)
- [ ] **Save-workflow on failure** — trigger a workflow save that fails (kill network or force an error). **Expect:** NO green "Workflow saved" toast; you see "Couldn't save the workflow." Only.
- [ ] **Store-request / community actions on failure** — force an error on approve/hide/delete in Policy → Store requests and Community. **Expect:** NO "Updated / Approved / Deleted" toast on failure; an error shows instead. On success, the toast still appears.

## 2. Dashboard (Live landing)
- [ ] Landing shows **one hero row of 5 vitals** and nothing else above the fold: **Checks today · Confirms · Reach rate · Credits left · Margin.**
- [ ] Each vital is **color-coded** (green good / amber watch / red bad), not just white numbers.
- [ ] Business & money, Funnel (leads/signups/paying), Community, Call time & cost, Call data health are **NOT stacked on the landing** — they live in their own tabs (Money/Calc, Users, Policy, Calls) or behind a tap-to-open row.
- [ ] **No all-caps eyebrow labels** on the landing (FUNNEL / ACTIVITY / COMMUNITY / BY MODEL / TALK TIME BY STATUS are gone).
- [ ] **No explanatory paragraphs** sitting on the page — the 5 flagged ones are either gone or moved into a ⓘ tooltip.
- [ ] Total numbers visible on first screen is roughly **5**, not ~40.

## 3. Type & spacing (the 42-size fix)
Verify against the **authority: `docs/design/STYLE_GUIDE.md` §3** (not a separate list).
- [ ] Every font size maps to a **role in Design's §3 table** (hero 30 / section 19 / card 14.5–15.5 / body 14–16 / meta 12.5 / eyebrow 10.5 / micro-label 10). No sizes outside those roles.
- [ ] **Focusable inputs are 16px** (anti-zoom) — a 16px input is CORRECT, not a "wrong size." Do not FAIL it.
- [ ] Weights match the table (heroes 900/800, body 500, meta 600) — no random outliers.
- [ ] Card titles all share the **same gap** below them (no card tighter/looser than its neighbor).
- [ ] Stacked stat cards share the **same gap** between them.
- [ ] Font is **Inter** everywhere (no system-font fallback showing).
- [ ] Spacing looks like it's on a consistent rhythm — no lone 3px/6px/13px one-offs.

## 4. Flow & labels
- [ ] The live sub-tab reads **"Live"** (was "Pulse").
- [ ] **Calc appears in exactly one place** (the tab) — no duplicate Calc toggle inside the landing.
- [ ] The Calls group's per-chain tab reads **"Chains"** (was "Settings") — and "App" is still separate.
- [ ] Sub-tab strips show a **fade/indicator on the right edge** when tabs overflow; on a phone you can tell more tabs exist and can scroll to them (Calc/last tab reachable).
- [ ] These labels are **sentence case**: "Mapped stats", "Select a chain", "Store settings", "Store data", "Call settings".

## 5. Copy & errors
- [ ] **No em-dashes (—)** anywhere in visible copy (tooltips, toasts, options, helper, placeholders).
- [ ] **No "sentence. lowercase fragment" toasts** — spot-check: mic-blocked, closed/no-call, muted, saved-live, call-placed all read as clean sentences.
- [ ] The dup-text tooltip is fixed — Max-talk help reads "…before wrapping up." (no "wrapping up.ping up").
- [ ] Every error names what failed — **no bare "Error:" dumps, no unlabeled "Could not save."** (spot-check saving a bail rule, a status, store data, a preset).
- [ ] Naming: transcript label says **Staff** (not Clerk); AI is **the caller** (not the agent); empty states say **the Admin dev agent** (not Claude).
- [ ] Store-name examples/placeholders have **no dashes** (e.g. "Barnes & Noble Brentwood").

## 6. Regression (didn't break anything)
- [ ] Admin loads clean (no console errors, no blank sections).
- [ ] Placing a real call, adding a store, editing a status, and saving a workflow all still work end to end.
- [ ] Success toasts still fire on success (only the failure paths changed).

## 7. Cleanup after sign-off (do this — don't let docs go stale)
Once every box above is PASS and the owner signs off on the **promote-to-prod**, **delete the one-time work-order docs.** Their job is done; the durable rules live in the guides. Confirm the target branch with the owner before deleting.
- [ ] Delete `voice-caller/docs/design/ADMIN_UI_AUDIT.md` (executed).
- [ ] Delete `voice-caller/docs/design/COPY_ADMIN_MASTER.md` (applied — it's a change list, not a reference).
- [ ] Delete this file, `voice-caller/docs/design/ADMIN_QA_HARNESS.md` (verified).
- [ ] Commit as "docs: remove applied admin work-orders (recoverable in git history)."

**Keep — living references, do NOT delete:**
- `voice-caller/docs/design/STYLE_GUIDE.md` (Design: type/size/color/components — the authority)
- `voice-caller/docs/business/COPY_STYLE_GUIDE.md` (Copy: voice)
- `voice-caller/docs/brand/CHECK_BRAND_STYLE_GUIDE.md` (brand mark)
- `voice-caller/docs/design/COPY_CHANGES_APPROVED.md` — **not part of this cleanup** (it's the consumer-site source of truth, owned separately). Leave it.

Anything deleted is fully recoverable from git history.
