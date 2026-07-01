# Admin overhaul — QA test harness

> Hand to QA **after** Admin ships the overhaul. Test on `checkitforme.com/admin` (branch `claude/retail-stock-voice-calls-OcyMS`). Each row: do the action, confirm the expected result. Mark PASS/FAIL. Spec lives in `ADMIN_UI_AUDIT.md`, `COPY_STYLE_GUIDE.md`, `COPY_ADMIN_MASTER.md`.

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
- [ ] Every font size on screen is one of **26 / 22 / 15 / 13 / 11px** — no in-between sizes.
- [ ] Only three weights in use: **500 / 700 / 800**. No thin/black outliers.
- [ ] Card titles all share the **same gap** below them (no card tighter/looser than its neighbor).
- [ ] Stacked stat cards share the **same gap** between them.
- [ ] Font is **Inter** everywhere (no system-font fallback showing).
- [ ] Spacing looks like it's on a **4/8/12/16/24** rhythm — no lone 3px/6px/13px oddities.

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
