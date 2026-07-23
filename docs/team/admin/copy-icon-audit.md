# Admin copy / icon / spacing audit (2026-07-23)

6-agent audit across all 22 pages + slide-ups vs COPY_STYLE_GUIDE + SPEC Part 1.
Total 98 (copy 61, icon 24, spacing 13). DONE so far: 46.

Waves 1 and 2 applied + shipped (copy mostly, 2 emoji icons -> Lucide clock, 2 shared sub-12px classes bumped). Unchecked = remaining worklist: the icon migration (legacy/unicode/inline glyphs -> Lucide dsIco, NOT the nav which the owner keeps), the per-page sub-12px + tap-target spacing, and the copy that needs an (i) sheet or a bigger rework (GTM taxonomy, Add import warning, Designer voice-model dropdown, Kiosk raw JSON, Fun Delta status map). Do page by page.

## COPY
- [x] **Users** (high) page (loadUsers staging error state) @ line 5475
      now: Staging sign-in needed — open staging.checkitforme.com once, then reload.
      fix: Staging sign in needed. Open the staging site once, then reload.
- [x] **Live** (high) Call health sheet @ line 5460 (loadCallHealth tile)
      now: dup ingests
      fix: repeat imports
- [x] **Live** (high) Call health sheet (subtitle under the sheet title) @ line 2747 (dashSheet subs.health)
      now: Real dialed calls vs seed and rehearsal
      fix: Real calls vs test calls
- [x] **Policy** (high) page @ line 5391, gw_pricing field (id gw_ga4)
      now: GA4 measurement id
      fix: Analytics ID  — put the raw Google Analytics measurement id behind an (i) info sheet, la
- [x] **Policy** (high) page @ line 5390, gw_pricing field (id gw_headstart)
      now: Finds headstart (min)
      fix: Members see finds first (minutes)
- [x] **Policy** (high) page @ line 5144, FLAG_GROUPS flag label 'stockSignals'
      now: Live stock feed  /  caption: Real-time stock rail on the site
      fix: Latest finds rail  /  caption: The row of recent finds on the site
- [x] **Alerts** (high) page @ line 5311, al_status delivery note
      now: Stubbed sends never reach a customer
      fix: Test sends only. Nothing reaches a customer yet.
- [x] **Alerts** (high) page @ lines 5317, 5319 (Sends row fact + subtitle) and 5327 (send-log status label)
      now: 'N stubbed' / '· N stubbed' / log chip label 'Stubbed'
      fix: 'N not delivered' / '· N not delivered' / log chip 'Not delivered'
- [x] **Plans** (high) page (toast) @ line 2488, savePlansDraft toast
      now: NOT saved — that edit did not go through. Try it again.
      fix: NOT saved. That edit did not go through. Try again.
- [x] **Kiosk** (high) page @ line 2050 (inspectInbox, Inspect button under "Emailed-in receipts")
      now: Reading restocktimer@gmail.com…
      fix: Reading the receipts inbox…
- [x] **Add** (high) Bulk import (details card) @ line 5678 (importStoresJson failure branch)
      now: Couldn't backfill the regions: "+((r&&r.error)||'unknown')
      fix: Couldn't import the stores: "+((r&&r.error)||'unknown')
- [x] **Add** (high) Bulk import (details card) + toast @ line 1037 button label; line 5684 toast strings
      now: Button: "Backfill regions"  ·  toasts: "Regions backfilled" / "Couldn't backfill the reg
      fix: Button: "Fill in missing regions"  ·  toasts: "Regions filled in" / "Couldn't fill in th
- [x] **Chains** (high) page (Map until locked live panel) @ line 2231, mapperPoll() varHtml (id mapper_bench)
      now: Variable ring (department pickup) — time-to-human varies call to call
      fix: Variable ring. A department picks up, so the time to reach a person changes every call.
- [x] **Chains** (high) page (Call settings, Max talk tooltip) @ line 3973, ssRenderCall() data-tip on Max talk
      now: Hard cap on how long the caller talks to a person before wrapping up.ping up.
      fix: Hard cap on how long the caller talks to a person before wrapping up.
- [x] **Designer** (high) page @ L1302, #sim_voice option (Step 6 Test)
      now: Bench default voice
      fix: Default voice
- [x] **Chats** (high) chat detail slide-up (sheet subtitle) @ line 3183, supTier(); rendered at line 3302
      now: 'Human email' / 'Tier 2' / 'Tier 1'
      fix: Needs a human / Bot unsure / Bot answered (Tier 1 -> Bot answered, Tier 2 -> Bot unsure,
- [x] **Chats** (high) page (category pills row) @ line 3233, loadSupportStats()
      now: Pending review · ${r.pendingReview}  (amber pill)
      fix: Delete this pill entirely.
- [x] **Users** (medium) page (user row plan chip) @ line 5487 (planFact)
      now: PAYG
      fix: Pay as you go
- [ ] **Users** (medium) User detail sheet (subtitle under name) @ line 5506 (userSheet openSheet subtitle)
      now: raw plan value, e.g. "Subscriber" / "Pay-as-you-go" / "Admin / test"
      fix: Use the same labels the row uses: Member / Pay as you go / Comp / Test
- [x] **Live** (medium) Call health sheet @ line 5459 (loadCallHealth tile)
      now: rehearsal
      fix: test calls
- [x] **Live** (medium) Call health sheet @ line 5457 (loadCallHealth tile)
      now: total rows
      fix: total calls
- [ ] **Alerts** (medium) page @ lines 5308-5310, al_status delivery chips
      now: ● Text off  /  ● Text live  /  ● Email off  /  ● Email live
      fix: SMS (off state): 'Text · not approved yet'; when working: 'Text live' / 'Email live'
- [ ] **Alerts** (medium) message editor sheet (sendAlertTest result) @ line 5365, al_test_out result text
      now: Logged but NOT delivered · the Twilio number isn’t live yet (pending A2P). ... Brevo key
      fix: Logged but not delivered. Text sending isn’t approved yet. / Logged but not delivered. E
- [x] **Policy** (medium) page @ line 5137, FLAG_GROUPS flag 'smsAlerts' caption
      now: ON once toll-free texting is approved · OFF = alert forms collect email only
      fix: Short caption: 'Text alerts to customers' + (i) info sheet holding the ON/OFF detail
- [ ] **Policy** (medium) Restock watches sheet (loadGwWatches) @ line 5703, gw_watches row
      now: {contact} · {channel} · store #{retailerId} · cat #{categoryId}
      fix: {contact} · {channel} · {store name} · {product name}
- [x] **Store Intel** (medium) page @ line 3430 (storecarries eyebrow)
      now: Carry each product · of 113,583
      fix: Stores carrying each product
- [x] **Kiosk** (medium) page (Inspect diagnostic) @ line 2053 (inspectInbox, not-configured branch)
      now: Gmail not configured (no creds set).
      fix: The receipts inbox isn't connected yet.
- [x] **Kiosk** (medium) page + Receipt sheet @ line 2019 (row title) and line 2036 (rcptSheet fallback)
      now: (no product parsed)
      fix: (no product found)
- [x] **Kiosk** (medium) page @ line 1125 (receipts eyebrow)
      now: Emailed-in receipts
      fix: Receipts inbox
- [x] **Kiosk** (medium) page (Inspect diagnostic) @ line 2058 (inspectInbox summary line)
      now: 12 emails · last 72h. 3 parse as kiosk receipts
      fix: 12 emails · last 72h. 3 count as kiosk receipts
- [ ] **Kiosk** (medium) Receipt sheet @ line 2046 (rcptSheet, r.raw block)
      now: <div class="k-eyebrow">Raw parse</div> + a <pre> JSON dump of r.raw
      fix: Relabel to plain 'Details we read' and drop the raw JSON dump from the everyday sheet (S
- [ ] **Add** (medium) Bulk import (details card) @ lines 1033-1037 (Bulk import summary + buttons)
      now: No warning that importing deactivates every store not in the pasted file (only shown aft
      fix: Add a red one-line warning above the buttons: 'Import replaces the whole store list. Sto
- [x] **Search** (medium) store card (expanded) @ line 3618 (storeDetailsHTML)
      now: Distro
      fix: Distributor
- [x] **Statuses** (medium) New status sheet (subtitle) @ line 1406, NEW STATUS button sheetFromHolder subtitle
      now: Display is instant. Detecting it on calls needs the extraction wired.
      fix: You will see it right away. Reading it off real calls has to be set up first.
- [x] **Statuses** (medium) page (add-status confirmation, id st_msg) @ line 4550, addStatus() success message
      now: Added ✓. Note: DISPLAY is live, but detecting this situation on calls needs the Admin de
      fix: Added. It shows up now. Reading it off real calls still has to be set up.
- [x] **Chains** (medium) page (Store data, checkbox label) @ line 3948, ssRenderData() first checkbox label
      now: First-party. sells at MSRP
      fix: Sells at MSRP (the store's own shelf)
- [x] **Chains** (medium) page (Map until locked, needs-target panel) @ line 2234, mapperPoll() needHtml prompt
      now: No customer-service option in this menu. which desk should we press for card stock?
      fix: No customer service option in this menu. Which desk should we press for card stock?
- [x] **Designer** (medium) page @ L4198, loadSandbox() sb_status text (Step 2)
      now: Test-bench agent not configured.
      fix: Voice tuning isn't set up yet.
- [ ] **Fun** (medium) page @ L2169 + L2178, td_status (Delta feed)
      now: dialing…  / when not live, prints the raw API status verbatim: s.status (e.g. "queued", 
      fix: Sentence-case, plain map: 'Dialing you…' and map raw states (queued/ringing→'Ringing you
- [ ] **Designer** (medium) page @ L1230-1231, #sb_model options (Step 2)
      now: Turbo v2 (natural)  /  Flash v2 (fastest, robotic)
      fix: Drop the raw model codenames: 'Natural' / 'Fast (less natural)'. Per SPEC this whole dro
- [x] **Fun** (medium) page @ L1435, Delta card (i) tooltip
      now: Runs a whole check on recorded clips, no live agent · go off script to hear the barge-in
      fix: …go off script to hear the live agent take over
- [x] **Fun** (medium) page @ L1456, #lab_personality label (Charlie card)
      now: Personality
      fix: Persona
- [x] **Chats** (medium) page (category pills row) @ line 3235, loadSupportStats()
      now: LLM $${Number(r.estCostUsd).toFixed(2)}
      fix: Chat cost $2.34  (or move the raw cost behind an (i))
- [ ] **Chats** (medium) page (chat list empty state) @ line 3252, loadSupportChats()
      now: No chat data yet. Waiting on the Support lane's API.
      fix: No chats yet. This fills in as people reach out.
- [x] **Chats** (medium) page (hero label, error state) @ line 3218, loadSupportStats()
      now: Support APIs aren't live yet. This lights up on its own once they land.
      fix: Chats aren't turned on yet. This fills in on its own once they start.
- [ ] **Chats** (medium) page (title) @ line 1053, k-title
      now: Support
      fix: Chats
- [ ] **Go-to-Market** (medium) page (Agent filter) + Add an item slide-up (Agent field) @ line 1895 GTM_AGENTS; used at line 1483 (filter) and line 1494 (add sheet)
      now: Agent list: Owner, DevOps, Website, Admin, Data, Copy, Design, QA, Support agent, Discor
      fix: Retire this 11-name taxonomy. SPEC item 22: collapse to 3 areas (Site · Admin · Voice) a
- [x] **Live** (low) Credits sheet (subtitle) @ line 2747 (dashSheet subs.credits)
      now: ElevenLabs · estimated from the last 31 days
      fix: Voice credits · estimated over the last 31 days
- [x] **Live** (low) Call health sheet (cleanup preview line) @ line 5467
      now: Cleanup preview · dry run · billed calls protected · restorable from ElevenLabs
      fix: Cleanup preview · nothing deleted · paid calls kept · restorable
- [x] **Search** (low) Filters panel (sort select) @ line 989 (f_sort option)
      now: Name A–Z
      fix: Name A to Z
- [ ] **Add** (low) Bulk import (details card) @ line 1034 tooltip; line 1035 placeholder; line 5675 error
      now: 'Paste store JSON…' tooltip, a raw JSON array placeholder, and error 'Invalid JSON'
      fix: Behind the Advanced gate this is acceptable for a power tool, but soften surface copy: t
- [ ] **Store Intel** (low) page (MSRP coverage row tooltip) @ line 3411 (TIP constant)
      now: Coverage: the % of the retail chains we know carry Pokémon at MSRP whose store locations
      fix: Trim to one line, e.g. 'How many of the chains we know carry Pokémon we've loaded stores
- [x] **Search** (low) Filters panel (status select) @ line 984 (f_status option)
      now: Bad / missing number
      fix: No phone number
- [x] **Calls** (low) page (sort filter) @ line 1109, r_sort option
      now: Store A–Z
      fix: Store A to Z
- [ ] **Chains** (low) page (Store data, Sell methods field) @ lines 3953-3954, ssRenderData() Sell methods tooltip + input placeholder
      now: in_store, pickup, ship  (raw values with underscores shown to the user)
      fix: Show human labels: 'In store, Pickup, Shipped' (map to the raw keys behind the scenes).
- [x] **Designer** (low) page @ L2928, renderPersonas() empty state for #pn_list (Step 4)
      now: No personas yet. build one above and save it.
      fix: No personas yet. Build one below and save it.
- [x] **Fun** (low) page @ L2183, td_feed transcript speaker label (Delta rehearsal)
      now: Speaker labelled TAPE (vs YOU for the person answering)
      fix: Label the agent side 'AI' (or 'Check AI').
- [x] **Chats** (low) page (stats wells) @ line 3229, loadSupportStats()
      now: Msgs avg
      fix: Avg messages
- [ ] **Chats** (low) chat detail slide-up (sheet subtitle) @ line 3302, openSupChat()
      now: raw status value shown verbatim: 'open' / 'escalated' / 'resolved'
      fix: Map to friendly words: Open / Needs a human / Resolved (reuse the same map as the row st
- [ ] **Go-to-Market** (low) page (Area filter) + Add an item slide-up (Area field) @ line 1896 GTM_AREA; used at line 1482 (filter) and line 1493 (add sheet)
      now: Backend / Frontend / Ops / Growth
      fix: Site / Admin / Voice
- [ ] **Go-to-Market** (low) page (progress bar, card chip, status filter) @ line 1927 bar ('critical'), line 1960 chip ('LAUNCH'), line 1484 filter ('Launch-critical')
      now: Three names for one thing: 'critical' / 'LAUNCH' / 'Launch-critical'
      fix: Pick one term everywhere (e.g. 'Launch-critical').

## ICON
- [ ] **Users** (high) page (empty state) @ line 5478 (emptyState('key',...))
      now: key glyph (from the legacy ICONS set, not Lucide) for 'No signups yet'
      fix: Lucide users (or user-plus) via the LUCIDE set / dsIco
- [ ] **Live** (medium) page (Credits report row) @ line 884
      now: lightning bolt SVG (Lucide zap) on the Credits row
      fix: Use a non-zap icon, e.g. Lucide gauge (voice balance) or coins
- [ ] **Restock** (medium) page (drill-in report rows) @ line 5583 (peek() builder)
      now: Call reality / Restock days / What's landing rows have no leading icon
      fix: Add a leading Lucide icon per row: phone-call (Call reality), calendar (Restock days), p
- [x] **Policy** (medium) Community moderation & Store requests sheets @ line 5711 (gw_community) and line 5750 (gw_storereqs) status line
      now: ⏳ (hourglass emoji) before 'N awaiting review' / 'N new'
      fix: Replace the ⏳ emoji with the Lucide 'clock' icon via dsIco('clock',...)
- [ ] **Kiosk** (medium) page (Inspect diagnostic) @ line 2060 (inspectInbox row head)
      now: '✓ parses' / '✗ rejected' (unicode check/cross glyphs used as icons, plus dev-speak)
      fix: Use dsIco('check-circle-2') in --green with label 'Counts' and dsIco('x-circle') in --re
- [ ] **Statuses** (medium) sub-nav tab @ line 1811, NAV_GROUPS.calls tab ['statuses','Statuses','tag']
      now: hand-drawn 'tag' icon (ICONS set)
      fix: Lucide flag (dsIco/lucideSvg 'flag')
- [ ] **Chains** (medium) sub-nav tab @ line 1811, NAV_GROUPS.calls tab ['trees','Chains','tree']
      now: hand-drawn 'tree' icon (ICONS set)
      fix: Lucide map (dsIco/lucideSvg 'map')
- [ ] **Feedback** (medium) sub-nav tab @ line 1811, NAV_GROUPS.calls tab ['feedback','Feedback','chart']
      now: hand-drawn 'chart' (bar-chart) icon
      fix: Lucide message-square (dsIco/lucideSvg 'message-square')
- [ ] **Testing** (medium) page @ L5062-5066, tcIcon() status glyphs in the call-log rows
      now: Bespoke hand-drawn SVG glyph set (check / x / q / phone) drawn in colored circles
      fix: Use Lucide per the concept map: check-circle-2 (in stock), x-circle (not in / sold out /
- [ ] **Chats** (medium) page (chat list rows, status at right) @ lines 3266-3269, loadSupportChats()
      now: Hand-drawn inline SVGs (up-arrow path 'M12 19V5M5 12l7-7 7 7' for escalated, checkmark '
      fix: Use the Lucide sprite (dsIco/lucideSvg): resolved -> check-circle-2, escalated -> arrow-
- [ ] **Go-to-Market** (medium) page (item card remove) + restore strip (dismiss) @ line 1961 (Remove) and line 1943 (dismiss), renderGtm()
      now: '×' text glyph used as the button (color #5C5C68, font-size:15px)
      fix: Delete/Remove -> Lucide trash-2 (destructive); the restore-strip dismiss -> Lucide x. Re
- [ ] **Restock** (low) page (empty state) @ lines 5536 and 5540 (emptyState('box',...))
      now: box glyph from the legacy ICONS set
      fix: Lucide package via the LUCIDE set / dsIco
- [ ] **Live** (low) page (Members report row) @ line 866
      now: single-person SVG (Lucide user, singular) on the 'Members' row
      fix: Lucide users (plural)
- [ ] **Policy** (low) Community moderation sheet (loadGwCommunity) @ line 5715, community post meta row
      now: ♥{likes} ... and a bare '✓ live' checkmark character
      fix: Use Lucide 'heart' for likes and Lucide 'check-circle-2' for the live/approved marker (d
- [ ] **Plans** (low) page @ lines 2431-2432, syncPill()
      now: '✓ in sync' and '● pending' using a checkmark char and a bullet char as icons
      fix: Lucide 'check-circle-2' for in-sync and 'clock' for pending (dsIco), sized as a chip ico
- [ ] **Calc** (low) page @ lines 2542-2543 (and hero label line 2525)
      now: Delta / Charlie shown as bordered segment buttons with a colored dot
      fix: Render the lane names as the standard lane chips (.ds-chip.delta / .ds-chip.charlie) wit
- [ ] **Search** (low) Filters @ lines 968 and 971 (msel-car / filters caret)
      now: ▾ (unicode caret glyph used as the dropdown icon)
      fix: Use dsIco('chevron-down') so the caret matches the Lucide set.
- [ ] **Kiosk** (low) page + Receipt/report rows @ line 2022 (receipt row chev); same .pk-chev inline path also at 3444 Store Intel reports, 1001 Search map peek
      now: Hand-drawn inline chevron SVG <path d="M9 6l6 6-6 6"/> on every drill-in row
      fix: Render drill-in chevrons via dsIco('chevron-right') so they use the Lucide set at the sy
- [ ] **Calls** (low) page (call row, restock verdict) @ line 4641, renderResults() shipmentDayHeard branch
      now: inline one-off hand-drawn truck SVG (<svg ...><path d="M2 7h11v8H2z..."/></svg>)
      fix: dsIco('truck', 15) — Lucide 'truck' already exists in the sprite
- [ ] **Chains** (low) page (Store settings toggle rows) @ lines 3863-3866, ssRenderStore() row(): Callable / Kiosk / Online / Stock verified
      now: toggle rows have no leading icon (label + count + ON/OFF only)
      fix: Add a Lucide icon per SPEC toggle row format [icon][label+caption][toggle]: Callable=pho
- [ ] **Designer** (low) page @ L1197 (and L3018-3019), #vs_rec Record/Stop button
      now: Uses the Unicode characters ● and ■ as record/stop icons
      fix: Use Lucide 'circle' (record) and 'square' (stop), or 'mic', via lucideSvg().
- [ ] **Designer** (low) page (all data-tip (i) buttons) @ L160 CSS rule [data-tip]::after, applied to the info tips on Steps 1-7 and Fun
      now: content:"ⓘ" — a Unicode circled-i glyph is the info button everywhere
      fix: Render Lucide 'info' as the (i) affordance instead of the ⓘ character.
- [ ] **Workflows** (low) Workflow editor sheet (wfSheet) @ L4865, wfmVoiceChips() remove control on each voice pin
      now: Raw '×' character as the remove button
      fix: Use lucideSvg('x',14) — matches the opener remove buttons on the same sheet (L4906/L4927
- [ ] **Go-to-Market** (low) page (restore strip icon + done circle) @ line 1940 (alert-triangle) and line 1953 (checkmark), renderGtm()
      now: Hand-drawn inline SVGs: warning triangle ('M12 3.5 21 19H3z...') and a check ('M5 12l5 5
      fix: Swap for the Lucide sprite versions (alert-triangle, check-circle-2) so they match the r

## SPACING
- [x] **Users** (medium) page (user row subline) + shared .peek CSS @ line 336 (.peek .pk-m), rendered at line 5494
      now: user metadata line ('X credits · Y calls · $Z') set at font-size 11.5px
      fix: Raise .pk-m to 12px (Caption)
- [ ] **Kiosk** (medium) Receipt sheet + Inspect diagnostic @ line 2041 (rcptSheet meta), lines 2062-2063 (inspectInbox fields)
      now: font-size:10.5px on the 'From the hit at…' note and the machine/product/snippet lines
      fix: Raise to the Caption size (12px). SPEC Part 1: nothing smaller than 12px exists; the 10.
- [ ] **Feedback** (medium) Feedback sheet (We said / They saw cards) + list row REVIEW pill @ lines 3144-3145 (9.5px labels) and line 3131 (9px REVIEW pill), fbSheet()/loadFeedback()
      now: font-size:9.5px labels 'We said'/'They saw'; REVIEW pill font-size:9px
      fix: Raise to 12px (Caption). SPEC Part 1: nothing smaller than 12px exists.
- [ ] **Workflows** (medium) Workflow editor sheet (wfSheet) @ L4925, 'Reset rotation' button style
      now: font-size:10.5px
      fix: Raise to 12px (Caption). Nothing smaller than 12px exists in the admin type scale.
- [ ] **Testing** (medium) page @ L5091, per-call metrics line in the log row
      now: font-size:11.5px (ui-monospace 'human … · talk … · total …')
      fix: Raise to 12px minimum.
- [ ] **Go-to-Market** (medium) page (item cards) @ lines 1960 (LAUNCH chip), 1965 (agent chip), 1966 (area chip), renderGtm()
      now: font-size:8.5px (LAUNCH), font-size:9px (agent chip), font-size:9px (area chip), all upp
      fix: Bump chips to Caption 12px / 500 per SPEC (nothing below 12px exists); use the standard 
- [ ] **Go-to-Market** (medium) page (item cards) @ line 1961 (Remove ×) and lines 1953-1954 (status-cycle circle), renderGtm()
      now: Remove '×' hit area ~19px (padding:0 2px, font 15px); status-cycle circle is 22px x 22px
      fix: Give both a >=44px tap area (pad the hit box even if the glyph stays small).
- [ ] **Live** (low) Members sheet (loadGwPulse 'Stats baseline' row) @ line 5431
      now: 'Start fresh' / 'Count all again' buttons at font-size 10.5px, padding 5px 10px (~20px t
      fix: Raise to 12px text with ~11px vertical padding so the tap target reaches ~44px
- [ ] **Alerts** (low) page @ line 923 (caption) and line 930 (oa_email input)
      now: Caption 'All in-stock alerts system wide can be sent to an owner account.' at font-size:
      fix: Bump caption to 12px (Caption min). Give the input a Caption label above it ('Where it l
- [ ] **Alerts** (low) page @ line 5308, delivery chip()
      now: Chip text at font-size:9.5px
      fix: Raise to 12px Caption (SPEC chip = Caption 500) so the status chips meet the 12px floor
- [ ] **Policy** (low) Community / Waitlist / Store-requests queue sheets @ lines 5715 (10.5px), 5729 (11px), 5753 (10.5px)
      now: Queue sheet meta lines rendered at 10.5px / 11px
      fix: Raise all queue-sheet meta text to 12px Caption
- [ ] **Statuses** (low) New status form + edit sheet (token hint line) @ line 1415 and line 4519, 'Use {product} ... to bold' hint
      now: font-size:10.5px hint line
      fix: Raise to 12px (Caption) per SPEC type floor.
- [ ] **Calls** (low) shared class (affects Calls / Statuses / App / Feedback rows) @ line 336 (.peek .pk-m 11.5px) and line 309 (.k-eyebrow 10.5px)
      now: .pk-m subtitle = 11.5px; .k-eyebrow section headers = 10.5px
      fix: Raise both to 12px (Caption) to meet the SPEC 12px floor.


## MANUAL / bigger reworks still open (from the craft pass, 24)
These need more than a string swap (an (i) info sheet, a dropdown restructure, dropping a raw block, the GTM taxonomy collapse). Do page by page.

- [ ] **Policy** — Restock watches row (loadGwWatches): change 'store #{retailerId} · cat #{categoryId}' to show store name + product name: The watch record only carries the numeric retailerId/categoryId; showing names needs the API to return them or a client-side lookup, not a copy-only edit.
- [ ] **Calc** — Render the Delta/Charlie lane picker as .ds-chip.delta / .ds-chip.charlie chips instead of bordered segment buttons: Rework: requires rewriting both the button markup (calc_lane_delta/charlie at ~2552-2553) and the calcSync selection-styling logic (~2650) that toggles border/background on the active button.
- [ ] **Alerts** — Add a visible Caption label 'Where it lands' above the oa_email input (it only has a placeholder today): Adds a new label element / restructures the input row; a structural change rather than a safe in-place string swap.
- [ ] **Kiosk** — Receipt sheet 'Raw parse' block (rcptSheet, r.raw) — relabel to 'Details we read' AND drop the raw JSON <pre> dump from the everyday sheet (SPEC gate).: Coupled relabel-plus-remove. Deleting/gating the JSON <pre> dump is a structural rework, not a one-line swap, and the safety rules say raw-JSON-dump removal goes to manual.
- [ ] **Add** — Bulk import (details card) — add a red one-line warning above the buttons: importing replaces the whole store list and deactivates every store not in the pasted file.: This adds new UI content (a warning line plus its length-checked Spanish), not an edit to an existing string. Needs a real build, and the placement/exact wording is a design/copy decision.
- [ ] **Add** — Bulk import surface copy — the 'Paste store JSON' data-tip (line ~1030), the raw JSON-array placeholder, and the 'Invalid JSON' errors (gw_json ~5676, gw_import ~5684).: The audit's fix text is truncated ('...soften surface copy: t') with no exact target strings, and it notes this is acceptable behind the Advanced gate. Guessing the softened wording would be unsafe; needs an owner/PM call.
- [ ] **Kiosk / Store Intel / Search** — Hand-drawn .pk-chev drill-in chevron (<path d="M9 6l6 6-6 6"/>) -> Lucide chevron-right at system stroke, on the Kiosk receipt row, Store Intel report rows, and Search map-peek row.: That exact .pk-chev SVG string appears ~24 times identically across many pages (the string is not unique enough for a surgical per-instance old_string), and converting only the 3 on my pages would leave a mixed chevron style across the admin. Safer as one coordinated pass on the shared .pk-chev pattern/CSS.
- [ ] **Statuses** — ICON sub-nav tab NAV_GROUPS.calls ['statuses','Statuses','tag'] hand-drawn 'tag' -> Lucide flag: Nav tab icon. Hard rule: do not touch NAV_GROUPS; owner explicitly keeps the current nav.
- [ ] **Chains** — ICON sub-nav tab NAV_GROUPS.calls ['trees','Chains','tree'] hand-drawn 'tree' -> Lucide map: Nav tab icon. Hard rule: do not touch NAV_GROUPS; owner explicitly keeps the current nav.
- [ ] **Feedback** — ICON sub-nav tab NAV_GROUPS.calls ['feedback','Feedback','chart'] hand-drawn 'chart' -> Lucide message-square: Nav tab icon. Hard rule: do not touch NAV_GROUPS; owner explicitly keeps the current nav.
- [ ] **Chains** — COPY Sell methods field: tooltip/placeholder 'in_store,pickup,ship' -> human labels 'In store, Pickup, Shipped': Needs a raw-key <-> human-label mapping on save/load (input binds to SS.sellMethods raw keys). Changing only the placeholder/tooltip would make typed human labels fail to save. Rework, not a copy swap.
- [ ] **Chains** — ICON Store settings toggle rows (Callable/Kiosk/Online/Stock verified): add a leading Lucide icon (phone/monitor/globe/check): Rows currently have no leading icon; adding one changes the row layout to the SPEC [icon][label+caption][toggle] format. Row-format rework, not an icon swap.
- [ ] **Calls** — SPACING shared .pk-m (line 336) and .k-eyebrow (line 309) raise to 12px: Already 12px in the current CSS (both lines). No change needed.
- [ ] **Fun** — td_status Delta feed at L2179/L1436 ('dialing…') and L2188 which prints raw API status (queued/ringing/etc.) verbatim: Needs a raw-state lookup map ('Dialing you…', queued/ringing to 'Ringing you…') and the 'live' string still carries a ● glyph; the audit spec is truncated so mapping each state would be guesswork. Rework, not a safe swap.
- [ ] **Designer** — #sb_model 'Voice model' dropdown options 'Turbo v2 (natural)' / 'Flash v2 (fastest, robotic)' at L1226-1227: This is the Designer voice-model dropdown the SPEC wants restructured (audit note: 'Per SPEC this whole dropdown…'); called out as a manual rework, not a plain option relabel.
- [ ] **Testing** — tcIcon() hand-drawn SVG glyph set (check/x/q/phone in colored circles) at L5066-5075: Whole-function rework: needs a per-status Lucide concept map plus a design call on keeping the colored-circle background vs using circle-check-big/circle-x. Not a one-line glyph swap.
- [ ] **Designer** — [data-tip]::after content:'ⓘ' info affordance at L160 (global tooltip glyph, used across Designer steps and Fun): CSS ::after content cannot hold an inline SVG; swapping ⓘ for Lucide 'info' needs a background-image data URI or a markup change. Structural rework.
- [ ] **Workflows** — 'Reset rotation' ghost button font-size:10.5px at L4934: Sits in a no-wrap space-between flex row next to the uppercase 'OPENERS · ROTATE PER CALL' eyebrow (now 12px, .12em tracking); bumping the button to 12px makes the row ~360px in a ~358px sheet body, so overflow is likely. Too tight to be sure. Owner's phone should judge.
- [ ] **Chats** — Page title Support -> Chats (audit COPY line 144, cited @1053): Already done: the k-title at line 1049 already reads 'Chats'. No edit needed.
- [ ] **Go-to-Market** — Agent taxonomy: retire the 11-name GTM_AGENTS list, collapse to 3 areas Site/Admin/Voice (audit COPY line 147, SPEC item 22): Structural rework touching GTM_AGENTS map + filter select + add-sheet select + stored item.agent keys; needs a key/data-migration decision, not a copy swap.
- [ ] **Go-to-Market** — Area filter labels Backend/Frontend/Ops-Growth -> Site/Admin/Voice (audit COPY line 186): Relabeling display text alone is semantically wrong (backend != Site); a correct change must remap the value keys (GTM_AREA + two selects + stored item.area) and pair with the taxonomy rework.
- [ ] **Go-to-Market** — Unify 'critical'/'LAUNCH'/'Launch-critical' to one term everywhere (audit COPY line 189): Coordinated term change across the progress bar, the mini chip, the filter option and the checkbox; standardizing on 'Launch-critical' grows the tiny title-row chip (overflow risk) and interacts with the chip restyle item 283.
- [ ] **Go-to-Market** — Bump item-card chips (LAUNCH 8.5px, agent/area 9px) to Caption 12px/500 (audit SPACING line 283): Not a pure size bump: also changes weight 900->500 on uppercase chips, and the two-chip agent/area row is tight at 12px 900-weight (unsure it clears a 360px card); interacts with the LAUNCH term (189) and tap-area (286). Coordinated chip restyle.
- [ ] **Go-to-Market** — Give the remove × (~19px) and status-cycle circle (22px) a >=44px tap area (audit SPACING line 286): Real layout rework: padding the hit boxes to 44px in the tight title row shifts the card layout; needs design, not a value tweak.