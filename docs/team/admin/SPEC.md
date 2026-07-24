# ADMIN SPEC — THE DESIGN SYSTEM + ALL 22 PAGES, DECIDED

THIS IS NOT A REDESIGN. The look stays. This is consistency (one type scale, one control
set, everywhere), reduction (kill what the verdicts kill), and focus (lead with what
drives decisions). If a change makes a page look "new" instead of "cleaned up," it's wrong.
Save as docs/team/admin/SPEC.md. This supersedes the CD comps from round 1 (discard them)
and completes REDESIGN.md with the two things it lacked: exact design-system values and a
page-by-page, element-by-element verdict for all 22 pages. AUDIT.md remains the wiring
reference. REBUILD_PLAN.md gates apply.

Evidence this fixes the right disease: the current app.html uses TWENTY-FOUR different
font sizes (8.5px to 46px; most common are 13, 12.5, and 10.5px — tiny), near-zero icons,
and per-page one-off styles. The system below replaces all of it.

================================================================================
PART 1 — THE DESIGN SYSTEM (exact values; no page may deviate)

TYPE — Inter, six sizes only. Delete every other font-size in Admin.
  Display  28px / 700  — the one hero number on a page (max one per page)
  Title    22px / 700  — page titles
  Subhead  15px / 600  — section headers, card titles, sheet titles
  Body     14px / 400  — all reading text, row labels, values
  Caption  12px / 500  — metadata, chips, captions under numbers
  NOTHING SMALLER THAN 12px EXISTS. The 10.5/10/9.5/9/8.5px classes die.
  Numbers in reports: ui-monospace for the value only, Body or Display size.

ICONS — Lucide (lucide.dev), via the official CDN sprite or inline SVG. 20px in rows,
  18px in chips, stroke-width 1.75, color inherits text color. NEVER hand-drawn, never
  emoji, never invented. Concept map (use these consistently):
  phone-call = calls · store = stores · bell = alerts · users = users · settings-2 =
  settings/flags · mic = voice · workflow = workflows · message-square = chats/support ·
  trophy = scores · zap = God View (exists) · flag = statuses · receipt = kiosk ·
  trending-up = reports · alert-triangle = warning/exception · check-circle-2 = good ·
  x-circle = failed · clock = timing · dollar-sign = money · flask-conical = testing ·
  map = chains/mapping · plus-circle = add · search = search · info = (i) buttons ·
  chevron-right = drill-in · trash-2 = destructive.
  Store/brand/product logos: ONLY real files under public/logos/{brand,chains,pokemon,
  products}. Missing logo = neutral rounded square with the store's initial, Caption size.

COLOR — keep the existing CSS tokens; enforce meaning:
  --green: good / on-target / money-positive ONLY. --red: destructive actions + failed
  states. --yellow: warnings/attention. --orange: pending/in-progress. --purple: reserved
  as the Charlie lane accent. Lane accents: Alpha --text-strong · Bravo --teal ·
  Charlie --purple · Delta --orange. Everything else is the neutral text ramp
  (--text-primary → --text-caption). Color never decorates; it always means.

SPACING — 4px grid. Page side padding 16. Section gap 24. Card padding 14, radius 14.
  Row (list/settings/log) min-height 52, internal gap 12. Tap targets ≥ 44px.
  Sheet bottom padding: 24px + env(safe-area-inset-bottom) — the Safari-bar fix, global.

CONTROLS — one set, used verbatim everywhere:
  Toggle: current green pill style, 44px tap area, row format = [lucide icon]
    [Body label + Caption caption] [(i) if needed] [toggle].
  Buttons: .act (green, Body 600) for the one primary action; .ghost for secondary;
    destructive = red text + confirm sheet. One primary action per view.
  Inputs/selects: 44px height, Body text, label = Caption above, never placeholder-as-label.
  Chips: Caption 500, tinted background from the token set (plan chips, lane chips,
    status chips all identical construction).
  (i) info button: lucide info, opens a Caption-titled mini-sheet; ALL explanatory prose
    lives there — pages carry one-line captions max.

SHEETS — page-grade hierarchy: Subhead title + Caption subtitle, then content in the
  same type/spacing as pages. No mid-sheet personality changes. Bottom padding per above.

REPORTS — a report = card: Subhead question-title ("Where are checks coming from?"),
  Display or Body answer, Caption context, chevron → evidence sheet. A report that
  answers no decision is deleted, not styled.

COPY — plain words, real feature names, no dashes anywhere (prose or data), no dev-speak,
  ≤ one-line captions, everything longer behind (i). Banned words on sight: stubbed,
  ingests, dup, backfill (customer-facing), soft-timeout, tapedeck, bench, mirror.
  FULL COPY SWEEP: every page's copy passes through docs/design/copy/COPY_STYLE_GUIDE.md
  and the lexicon during its rollout task — every label, caption, button, and status is
  checked: is it the real feature name, does it plainly describe what the thing does,
  would the owner say it? Anything that fails gets rewritten in that task, not just the
  named examples in this spec.
  Lane names DECIDED: Alpha / Bravo / Charlie / Delta are official INTERNAL terms —
  they stay in Admin (the owner speaks them), never on the consumer site. Add to lexicon.

================================================================================
PART 2 — ALL 22 PAGES: SPECIES + ELEMENT VERDICTS
(KEEP = stays, restyled to system. MOVE = relocates. KILL = deleted. Copy fixes inline.)

GOD VIEW
1. LIVE — DASHBOARD.
   LEAD: NEW model scoreboard (Alpha/Bravo/Charlie/Delta cards: checks · success % ·
   avg length · cost/check vs 5¢, green/red) · NEW exceptions list (last-call failures:
   store · what happened · when → call detail) · funnel (leads/signups/paying/members/
   revenue). KEEP as one row: checks today/7d/30d. MOVE to sheets: Call time,
   Per-store averages, Credits (with limit edit + confirm). MOVE Call-health → a
   Maintenance sheet reachable from Live, off the main view; "dup ingests" → "repeat
   imports blocked". KILL: Money sheet (scoreboard + Calc absorb it). "Start fresh"
   stays in its sheet + confirm.
2. USERS — LIST (staging-aware, keep wiring).
   KEEP rows → restyle: phone/name · NEW plan chip · credits · last active. NEW: sort +
   filter by plan (Free / Pay-as-you-go / tiers / Comp). Detail sheet keeps all fields
   (signed up, phone, credits, checks, spent, caller ID) retypeset; Mark admin/test;
   Reset = destructive confirm. KILL: nothing.
3. RESTOCK — REPORT. KEEP the intel report + per-store drill (empty state: "Nothing
   learned yet — fills as real calls happen"). It becomes THE one home for restock
   intel (Policy's copy dies). Gains env picker view.
4. ALERTS — EDITOR (messages) + a small LOG (send log).
   KEEP: message list (Restock, Auto check results, Store went live, We're live in your
   area, Confirm your email, In-stock alert...) → editor sheet per message (text ·
   email subject · email body · token row · save · test-send). KEEP admin in-stock
   alert row. COPY: status chips become honest — "Test only · SMS not approved yet",
   "Email live". KILL: nothing. NOTE for wiring epic: alert copy becomes staging-
   editable (alerts_json into the promote path).
5. POLICY — SETTINGS (exploded).
   KEEP ONLY feature flags, two groups (Consumer / Admin & Global), system toggle rows:
   Text alerts (SMS) · Kiosk intel + rewards · Kiosk receipt rewards · Community wall ·
   Community auto-approve · Referrals · Share cards · "Latest finds rail" (RENAME from
   "Live stock feed") · Driver hand-off demo · Live-listen · Post Your Score (RENAME
   from the invented flag word) · Fresh-result cache (24h) · Overnight hours-harvest.
   Captions rewritten plainly, details behind (i). MOVE: pricing + rewards fields AND
   memberships/bundles mirror → PLANS. MOVE queues: Restock watches → Restock ·
   Community moderation → a Community sheet on Policy? NO — → the consumer-features
   owner page: Community moderation → Chats? DECIDED: Community moderation + Store
   requests + Waitlist live as three queue sheets on one "Queues" row at the bottom of
   Policy? NO. FINAL: Store requests → Stores/Add (it creates stores). Community
   moderation → its flag's (i) sheet is wrong for a queue — it gets a LOG-style sheet
   linked from the Community wall flag row ("Review queue · N"). Waitlist (+ email
   blast) → Users (they're future users; blast gets a confirm). KILL: pulse block
   (Live owns members), intel block (Restock owns), kiosk block (Kiosk owns),
   plans-mirror (Plans owns). COPY: "GA4 measurement id" → move into an (i)-explained
   Analytics row; "Finds headstart (min)" → "Members see finds first (minutes)".
6. CALC — SANDBOX, exempt (owner keeps). Only change: lane names render as chips with
   the standard lane colors; jargon tooltips stay inside Calc.
7. PLANS — EDITOR. KEEP tier/bundle editing + Publish (real Stripe = red-flag confirm
   sheet stating "creates real prices"). ABSORBS from Policy: per-check price · minimum
   top-up · free checks · kiosk reward · referral reward · store-add reward · finds
   headstart. NOTE wiring: auto-save-to-prod gets the env picker treatment (draft on
   staging, promote).

STORES
8. INTEL — REPORT. LEAD reorder: callable % + coverage gaps lead; 113,583 total is
   context. KEEP: states, chains, MSRP coverage (trim tooltip), carry-by-product list
   (real product logos, Body-size counts, header → "Stores carrying each product"),
   reports By store type / Top regions / Most checked (report-card pattern).
   Gains env picker view of staging counts.
9. SEARCH — LIST + action. KEEP: search, filters, store rows (logo rule applies),
   demo-store phone save, per-store workflow select, card-tap real call (gets a confirm
   naming the store + "places a real call"). KILL: dead refreshHours/backfillAllHours
   code. NOTE wiring: store edits route through the store pipe, not raw prod.
10. ADD — EDITOR. KEEP: single add form (Name · Phone · Location · Timezone · Phone
    menu). GUARD for launch: Import stores + Backfill regions move behind an "Advanced
    · data tools" (i)-gated sheet with red warning ("Import replaces the whole store
    list — stores not in the file are deactivated"). FIX copy bug: import failure says
    the import failed, not "Couldn't backfill the regions". GAINS: Store requests queue
    (from Policy).
11. KIOSK — REPORT. KEEP machines + receipts + cadence. KILL from daily view: Inspect
    inbox raw-email dump → behind Advanced (dev diagnostic). COPY: hide the raw gmail
    address; label it "Receipts inbox".

CALLS
12. CALLS (results) — LOG. KEEP stream + filters + detail. Gains env picker (see
    staging calls at last). Inherits Feedback's polish.
13. FEEDBACK — LOG (the model page). KEEP everything; restyle only. Badge stays pinned
    to Live.
14. STATUSES — EDITOR list. KEEP add/edit of verdict registry (live-instantly warning
    chip). NEW: delete with confirm (the missing handler ships with the wiring epic).
    KILL: dead saveStatus code.
15. CHAINS — LIST (dense). KEEP: chain rows, per-chain settings, Map · Map-until-locked
    · Stop, mapper/trainer live cards, bulk patch. Real-call actions get the standard
    "places real calls · 12/day cap" confirm. Lane names as chips. KEEP the glossed
    footnote pattern.
16. APP — SETTINGS. KEEP: "Customers hear calls live" toggle · default workflow select.
    MOVE raw-JSON policy editor behind Advanced with red warning. KILL: dead
    loadSettings/toggleVoicemail (vmToggle isn't on the page).

VOICE
17. DESIGNER — EDITOR (wizard). KEEP the step flow but each step adopts the system
    (Subhead step titles, Body controls, one primary action). KILL from the wizard:
    voice-model dropdown (Turbo/Flash), "Naturalness", soft-timeout — expert dials
    behind Advanced. DE-DUP: rotation step becomes a link to Workflows; test step
    becomes a link to Fun (one rehearsal path). Live-voice switch gets a confirm
    ("changes what real calls sound like"). Jargon dies on the surface.
18. WORKFLOWS — EDITOR (the reference master; owner likes the concept).
    KEEP: workflow cards (name · lane chip · voice · persona · opener · default) →
    editor sheet (name, lane, voice, persona, opener rotation + count, save, delete
    confirm, set default, "Tune in Designer" link). Comp/build must render the env
    state: "Editing: Staging". Each field editable in ONE place (this page); Designer
    links here.
19. TESTING — LOG. KEEP as-is, restyle. Add one "Place a test call → Fun" link (its
    only gap).
20. FUN — SANDBOX, exempt. Unify: its Personality list reads from Designer's persona
    system (kill the second personality model); lane chips standard.

HELP + LAUNCH
21. CHATS — LOG + teach. KEEP: stats row, chat stream, mark resolved, teach-an-answer.
    NEW: every teach/resolve action row shows an env chip ("→ trains Staging brain")
    so silent prod-training ends. KILL: dead supReindex; "Pending review · N" pill
    (no screen behind it). COPY: drop the invented "Tier 1 / Tier 2 / Human email"
    labels → "Bot answered · Bot unsure · Needs a human".
22. GTM — LIST (checklist). KEEP through launch: items, add form ("What needs doing" ·
    Area). SIMPLIFY: the 11-agent assignment taxonomy → 3 areas (Site · Admin · Voice).
    Retire the page at launch.

================================================================================
PART 3 — EXECUTION, DECIDED
CD is off the masters. Round 1 proved comps hallucinate what they can't fetch; this spec
is executable directly. Claude Code builds the six masters as REAL pages behind a hidden
staging route (/admin#preview): Live · Users · Store Intel · Feedback · Policy ·
Workflows, exactly per this spec, using Lucide + real logos + the six-size type scale.
Owner reviews on his phone against reality, not drawings. After his bless, the remaining
16 pages roll out one task per page (species master + this spec's verdicts), copy gate
and gap-check enforcing. CD returns for net-new features later, always through the inbox.
Task 1 before any page: implement the design system itself as shared CSS (the six type
classes, tokens enforcement, controls, sheet padding) + the Lucide include — so masters
are assembled from system pieces, not restyled one-offs.

================================================================================
PART 4 — HANDOFF (the agent executing this starts here)
1. Save this whole file as docs/team/admin/SPEC.md, commit, push to staging.
   Read docs/shared/REBUILD_PLAN.md and docs/team/admin/AUDIT.md first; all gates apply.
2. TASK 1 ONLY: build the design system as shared CSS — the six type classes (28/22/15/
   14/12, nothing smaller than 12px), token enforcement, the one control set, sheet
   safe-area padding, Lucide include + concept map. Build the Live/Staging toggle in the
   nav matching the owner's attached screenshot EXACTLY (CD's approved design); wire it
   to read-routing per the wiring epic, Live default. Nothing else.
3. STOP: render the toggle + type scale on one page at /admin#preview on staging, paste
   verify-live output, and wait for the owner's phone review.
4. Only after his approval: build the six masters at /admin#preview ONE AT A TIME in
   this order — Live · Users · Store Intel · Feedback · Policy · Workflows, stopping
   for his review after each. Then the 16 rollout tasks, one page per chat, per Part 2.
5. Every step: copy sweep per Part 1, gap-check against the blessed masters, verify-live
   pasted, no dashes, no new files outside allowed paths.
