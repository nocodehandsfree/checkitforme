# Admin UI audit — copy, layout, flow

> **File:** `public/app.html` (admin). **Audience:** the operator (you).
> **What this is:** the full pass you asked for — what to move to tooltips vs. keep on the page, alignment/spacing, error messages, the "God View → Live" miss, and whether each flow/label makes sense. Hand it to Admin as a punch list. Line numbers reference the current `app.html` on the OcyMS branch; Admin should confirm on apply.
> **Sibling:** the mechanical copy sweep-cleanup lives in `COPY_ADMIN_MASTER.md §2b/§2c`. This doc is the layout + flow + errors layer on top.

Priority tiers are marked **[P1]** (do first — visible or a real bug), **[P2]** (worth it), **[P3]** (polish).

---

## THE HEADLINE — clean up the dashboard, match the website's restraint  **[P1]**

The Pulse/Live landing is the "too much shit to focus" page: **~40 numbers, 6 stacked multi-section cards, and 5 explanatory paragraphs on one screen.** The website feels clean **not** because of different colors — the design tokens already match (same `--bg #0C0C12`, `--green #4ADE80`, `--purple #A78BFA`, `--muted`, `--border`). The site feels clean because it shows **one thing at a time with air around it.** Bring that restraint here. Two moves:

### 1. Less per screen (the style guide, applied: fewest words · one thought · color over copy)
- **Above the fold = one hero row of ≤5 vitals, color-coded, nothing else.** The numbers you actually check first: e.g. *Checks today · Confirms · Reach rate · Credits left · Margin.* **You pick the 5.** Everything else is one tap away, not stacked.
- **Move the rest to where it belongs** (this also feeds the IA rethink in §G — the dashboard is cramming what other tabs are for):
  | Card crammed on Pulse now | Belongs in |
  |---|---|
  | Business & money (8 stats) | its own Money view / the Calc tab |
  | Funnel — leads / signups / paying | Users |
  | Community — watching / scores / pending | Policy |
  | Call time & cost | Calls (it's call analytics) |
  | Call data health | Calls |
- **Kill the all-caps eyebrow labels** — `FUNNEL · ACTIVITY · COMMUNITY · STATS BASELINE · BY MODEL · TALK TIME BY STATUS`. They're label-noise; the numbers plus one card title carry it.
- **Every explanatory paragraph → a ⓘ tooltip or delete.** These are teaching text an operator reads once — they should not sit on the page forever:
  - "Time to reach a person vs. talk time. We're billed for the whole call…"
  - "Alpha/Bravo 'talk' still counts phone-tree time until we tag the live-human handoff…"
  - "The unfiltered truth about every call row. real dialed calls vs. seed / rehearsal…"
  - "Real-call stats (Pulse · Restock · Call timing) count everything."
  - "Only 40% of calls reach a person… **that's** the gap to close, not stock." (also a sweep artifact.)

  **Net: Pulse goes from ~40 numbers + 5 paragraphs to ~5 vitals + tap-to-expand. Same data, one focus.** Apply the same "hero + collapse" cut to the other dense pages (Restock intel, Call time & cost) after.

### 2. One rhythm (the type + spacing scale — see §F)
Even clean content reads as noise at **28 different font sizes** and a dozen ad-hoc margins. Conform to the **type scale in `docs/design/STYLE_GUIDE.md` §3** (Design's authority — hero 30 / section 19 / card 15 / body 14–16 / meta 12.5 / eyebrow 10.5; **16px focusable inputs**). Apply it everywhere and kill the ad-hoc sizes. This alone makes the same data feel calm. Worst offenders in §F.

*(A clean static mock of the redesigned Pulse page — built on the shared tokens — can be handed to Admin as the visual target if you want one. Offered, not built yet.)*

---

## A. The rename you asked about — "God View" → "Live"  **[P1]**

You're right, it never happened. The nav group is still labelled **God View**.
- **DECIDED:** rename **just the Pulse sub-tab → "Live"** (line 1135, the `['dash','Pulse','bolt']` entry → `['dash','Live','bolt']`). Leave the group name for now — it's part of the bigger nav rethink in §G.
- Everything that says "god view" elsewhere is a code comment (307, 309, 539, 1416, 1424) — not visible, leave it.

**What else I think got missed / is worth a look (below): the two "Settings" tabs, a duplicated Calc, and a batch of Title-Case labels that break the house sentence-case.** All in section E.

---

## B. Too much copy on the page → move to a tooltip or cut  **[P1]**

The admin's on-screen copy is *mostly* lean — the density lives in tap tooltips, which is the right place. But a handful of **always-visible** section subtitles are full paragraphs. These are the ones your eye is snagging on. Recommendation: keep a short first line on the page, push the "how it works" into the ⓘ tooltip on the header, cut the instruction to tap.

| Line | On the page now | Keep on page | Move to tooltip / cut |
|---|---|---|---|
| 610 (Testing) | "Your test-call log. **owner-only / Fun stores only**. These never touch the real-store numbers. Call yourself, mess with the caller, and read back the workflow, the exact opener used in rotation, the status, and the timing." | **"Your test-call log. Owner-only, Fun stores only."** | Everything after → tooltip. |
| 605 (Workflows) | Full paragraph w/ 3 bold spans explaining opener set + default + where to build. | **"Each workflow is a saved opener set + voice + persona."** | The "★ default powers every store… build in Designer" → tooltip. |
| 599 (Restock) | "When stores restock + what's landing. **learned** from real call data. Tap a store for its own breakdown." | **"When stores restock, and what's landing."** | Drop "Tap a store…" (it's discoverable); "learned from real call data" → tooltip. Also a sweep artifact (`. learned`). |
| 586 (Call data health) | "The unfiltered truth about every call row. **real** dialed calls vs. seed / rehearsal / never-placed. The true first call ignores seed rows and the 'Fun' rehearsal store." | **"Real dialed calls vs. seed and rehearsal."** | The rest → tooltip. Also a sweep artifact (`. real`). |
| 578 (Call time & cost) | "Time to reach a person vs. talk time. We're billed for the whole call (ring, menu, hold, talk), so reaching someone is real cost." | **"Time to reach a person vs. talk time."** | "We're billed for the whole call…" → tooltip. |
| 569 (Credits) | "Estimate from the last 31 days ⓘ. Enter your plan size below until live balance is on." | **"Estimate from the last 31 days."** | The ⓘ mid-sentence is awkward; move the "enter your plan size" instruction to sit *with* the input, not in the header. |

Everything else on-page (labels, buttons, the Statuses `{product}`/`<b>` helper at 1018) is appropriately short — leave it.

---

## C. Copy voice — sweep artifacts still in toasts & subtitles  **[P1]**

The em-dash sweep turned every ` — ` into `. ` even mid-sentence, so ~20 strings read as "Full sentence. lowercase fragment." The tooltip ones are already logged in `COPY_ADMIN_MASTER.md §2b`. **These toasts/subtitles are the ones that doc didn't cover** — add them:

| Line | Now | Fix |
|---|---|---|
| 1754 | `Mic blocked. allow microphone access` | `Mic blocked. Allow microphone access.` |
| 2118 / 2160 | `🔒 Closed. no call placed` | `🔒 Closed, no call placed` |
| 2331 | `Muted. dropped from customers` | `Muted, dropped from customers` |
| 2225 | `Saved. store is live ✓` | `Saved, store is live ✓` |
| 2549 | `Muted. hidden from consumers in every city` | `Muted, hidden from consumers in every city` |
| 2937 | `Saved. live in Check It For Me + Test Bench now` | `Saved. Live in Check It For Me and Test Bench now` |
| 2963 | `Call placed. the result lands…` | `Call placed. The result lands…` |
| 2690 | `Loaded "…" into the draft. test it, then apply…` | `Loaded "…" into the draft. Test it, then apply…` |
| 3321 | `Cloned as "…". edit it below…` | `Cloned as "…". Edit it below…` |
| 3361 | `Rotation reset. next call uses opener #1` | `Rotation reset. Next call uses opener #1.` |
| 3525 | `Fresh start. real-call stats now count from today` | `Fresh start. Real-call stats now count from today.` |
| 3579 | `Flagged as admin/test. won't count as a customer` | `Flagged as admin/test. Won't count as a customer.` |
| 1631 | `Saved. live calls rotate these scripts…` | `Saved. Live calls rotate these scripts…` |
| 3805 | `Something went wrong. check the server…` | `Something went wrong. Check the server…` |

Rule for Admin: **period → comma** when the second part is a fragment; **capitalize** when it's a real second sentence.

---

## D. Error messages  **[P1 for the bugs, P2 for the copy]**

### Two real bugs — success shown on failure
- **Line 1738 (`saveWorkflow`):** on error the inline text correctly says "Could not save," but `toast('Workflow saved')` fires **unconditionally** right after. A failed save still flashes a green "Workflow saved." **Gate the toast behind `!r.error`.**
- **Lines 3749–3751 (`srStatus`, `modCommunity`, `delCommunity`):** the API result is never checked — they always toast `Updated` / `Approved` / `Deleted` even if the request returned an error. **Check `r` before the success toast.**

### Copy — name the object, drop bare "Error:"
`Could not save` appears ~11 times with no object, and `Error: '+e` dumps raw errors 6+ times. An operator should know *what* failed:

| Lines | Now | Fix |
|---|---|---|
| 2235 / 2585 | `Error: ` + raw | `Couldn't place the call: …` / `Couldn't call you: …` |
| 2667 | `Error: ` + raw | `Couldn't apply to stores: …` |
| 2683 / 2689 / 2695 | `Error: ` + raw | `Couldn't save / load / delete preset: …` |
| 3693 | `Error: … || 'failed'` | `Import failed: … || 'unknown'` |
| 1568, 2294/2295, 2408, 2519, 2550, 2938, 3397/3403/3409 | `Could not save` | Add the object: `Couldn't save the bail rule` / `…that chain change` / `…store data` / `…the phone tree` / `…the status` / `…the default workflow` / `…the store workflow`, etc. |
| 1377 | `Error placing calls.` | `Couldn't place the calls. Hit Refresh and retry.` |
| 3699 | `Failed` | `Couldn't backfill regions` |

Full line-by-line table is in the working notes if Admin wants every one.

---

## E. Flow & labels that don't make sense  **[P1–P2]**

- **[P1] Two "Settings" tabs, side by side.** The **Calls** group is `Calls · Schedules · Statuses · Settings · App` (line 1137). "**Settings**" (the `trees` tab) is actually **per-chain** setup — you pick a chain and edit Store Settings / Store Data / Call Settings / Mapping. "**App**" is the app-wide settings. Two "settings" next to each other is confusing. **Rename the `trees` tab "Settings" → "Chains"** (matches its content and the "Select a chain" picker). Keep "App."
- **[P2] Calc appears twice — DECIDED: one place.** There's a **Calc** sub-tab (1135) *and* a **Calc** toggle inside the Pulse Overview (line 543, `showDashView('calc')`). Keep it as the **sub-tab only** (not a sub-sub toggle) and **remove the in-Pulse toggle** (543, plus the `dash_calc` sub-view at 590 and the split-home logic the comment at 1424 describes). One door.
- **[P2] Title Case labels break the house style.** The app is sentence-case everywhere ("Feature flags," "New schedule," "Restock watches"), but the Chains screen uses Title Case: **"Mapped Stats" (952), "Select a Chain" (956), "Store Settings" (968), "Store Data" (972), "Call Settings" (976).** Lowercase the second word: "Mapped stats," "Select a chain," "Store settings," "Store data," "Call settings."
- **[P3] Designer is a 7-step wizard** (Voice → Voice feel → Script → Persona → Rotation → Test → Save). It flows fine, but **Step 5 (Rotation) is half-built** — it literally says "Voice rotation is test-only right now." Consider hiding Step 5 until DevOps wires live rotation, so the wizard is 6 real steps instead of 7 with a dead one.

---

## F. Size, spacing, color — does it read right for the task?  **[P2, one P1 root cause]**

**Root cause (P1 to decide, then P2 to apply):** there is **no type scale and no spacing scale.** The file uses **28 different font sizes** (10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5 … up to 46px) and margins scattered across 2/3/4/5/6/8/10/12/13/14/16/18px — almost all as inline `style=` magic numbers. That ad-hoc drift is exactly the "spacing doesn't feel right" instinct. **Fix:** conform to `docs/design/STYLE_GUIDE.md` §3 (Design's existing type/size/color scale, incl. 16px inputs) as shared classes, and replace every ad-hoc inline size/margin. Do NOT invent a new scale — match Design's. Below are the highest-value specific offenders to start with:

- **[P1] Card-header gap is all over the map.** `.card>.name` already defaults to `margin-bottom:6px`, but inline overrides set it to **2 / 4 / 8 / 12px** across cards (e.g. Settings cards all 4px at 769/778/782/786/790, Designer steps all 12px at 823/837/880/889…, and two neighbors on one page differ: "Today's pulse" 8px @551 vs "Business & money" 12px @555). Pick one value, delete the overrides.
- **[P1] Stat-grid bottom gap has six values.** `.stats` defaults to 16px but is overridden to **0 / 4 / 6 / 12 / 14 / 16** (556, 579, 618, 953, 2452, 3542, 3602, 3615…). Most visible where two stat cards stack. Standardize.
- **[P2] Muted captions (`.meta`, default 12.5px) render at 10 / 10.5 / 11 / 11.5px** in different rows — sometimes two different sizes in the *same* row (3655 at 11.5px next to 3656 at 11px). Collapse to one caption size.
- **[P2] List-row padding differs across identical rows:** 9px (3654) vs 8px (3720, 3742) vs 5px (3733). Same visual list, different density.
- **[P2] Two verdict widgets don't share a column width:** `.callrow .cv` is 80px (410), the consumer-ported `.vpill` is 86px (434) — their right edges won't line up, and their labels are 11px vs 12px so baselines differ. Match them.
- **[P3] A lone stat tile is short:** line 3103 uses `padding:9px 15px` where `.stat` is `13px 15px` — one tile sits lower than its row-mates. And 2453–2455 puts an 18/18/**15**px number in one 3-tile grid (the "mapped" tile reads smaller than its neighbors).
- **[P3] Duplicated pagers** (stores 656-659 vs calls 710-713) repeat the same magic numbers inline — pull into one class so they can't drift apart.

**Color:** the color system itself is consistent and good (green go / red no-go / amber unclear / gray neutral, matching the consumer front end). No color changes recommended — the issue is size/spacing rhythm, not color.

---

## G. Nav & information architecture — IN DISCUSSION  **[P1]**

**The mobile bug (fix regardless of any reorg):** the sub-tab strip `.subnav2` (line 462) is `overflow-x:auto` with the scrollbar hidden (`::-webkit-scrollbar{display:none}`) and **no fade/arrow indicator.** On a phone, any tab past the right edge is invisible with no hint it exists — which is why the Calc tab (5th in God View) was never seen. **Add a right-edge fade or a chevron when the strip overflows**, or wrap the tabs. (Also: the `#grpnav` comment at 535 says "five groups" — there are **4**. Stale comment.)

**Current map (4 groups, ~19 sections):**
| Group | Sub-tabs |
|---|---|
| **God View** | Live (was Pulse) · Users · Restock · Policy · Calc |
| **Stores** | Intel · Search · Add · Zones · Kiosk |
| **Calls** | Calls · Schedules · Statuses · Chains (was Settings) · App |
| **Voice** | Designer · Workflows · Testing · Fun |

**Open for the owner (his call):** order groups + tabs by how often/urgently they're used, and combine to get each group ≤4 tabs so nothing overflows on a phone. Early combine candidates to react to — *not decided:* fold **Add** into Stores→Search (as a button, not a tab); merge **Policy + App + Statuses** into one config area; tuck **Fun** under Voice→Testing; **Calc** is a finance tool, maybe demote. **Owner is sending more direction before we lock the new order.**

---

## Suggested order for Admin
1. **P1 bugs first:** D (success-on-failure toasts) — those are wrong, not just ugly.
2. **P1 visible copy:** A (God View → Live), B (trim the wordy subtitles), C (sweep artifacts), E (two Settings tabs).
3. **P1 spacing root:** the two card/stat gap standardizations in F.
4. **P2/P3:** the rest of E and F as polish.
