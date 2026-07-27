# ADMIN REDESIGN — EXECUTION DOC
Save this as docs/team/admin/REDESIGN.md, commit, then follow THE PIPELINE at the bottom.
This carries the owner's verified decisions from the full Admin audit walkthrough. It outranks
old comps and old copy. Read docs/shared/REBUILD_PLAN.md first — all gates apply.

## THE ONE PROBLEM
Admin is 22 pages with no shared design law. Fix the law once, stamp it on every page.
Nothing is exempt. A page earns its content: if a number or report doesn't help the owner
make a decision on his phone, it doesn't belong on the page.

## THE TEMPLATE (design law for every page — CD comps to THIS)
Page anatomy, top to bottom:
1. Page title (one line) + one-line subhead in plain words. Nothing else explains itself
   in paragraphs — use (i) info buttons for anything that needs explaining.
2. Environment picker: one dropdown, always visible, top of Admin — Live site / Staging
   site. It must be impossible to not know which world you're looking at.
3. Decision zone: the 1-4 numbers or items the owner acts on. Big, thumb-sized, mobile-first.
4. Everything deeper lives behind a tap: slide-up sheets. Sheets follow the SAME type
   hierarchy as pages top to bottom — no shrinking into tiny tables halfway down — and
   every sheet gets bottom safe-area padding so Safari's URL bar never covers content.

Type: one hierarchy everywhere — header / subhead / body / caption. Same sizes, same
weights, every page, every sheet. Mobile is the only screen that matters.

Color: green means good or money. Nothing else is green. Status colors carry meaning
(good / warning / problem); white is neutral data. Never color as decoration.

Icons: use them to carry meaning and cut text. Every nav item, section, and status can
have one. Less text, more space.

Copy: plain words the owner uses. Real feature names only (it is "Post Your Score" —
never an invented flag word; "Live stock feed" is wrong, it reads like a stock-market
app — rename to what it actually is, e.g. "Latest finds rail"). No dashes anywhere,
including inside data displays ("- $10 - 0%" is banned; state what it means: "Spend $10 ·
on target"). No dev-speak in the UI: "stubbed" → "test only, not delivered"; "dup
ingests" dies. If a label needs a sentence, the sentence goes in an (i) button.

Controls: one styled set used everywhere — toggles, dropdowns, text inputs, radio,
buttons. A settings row = title + short caption + control, uniform height and spacing.
No page may drift into a different-looking section halfway down (the Policy page's
pricing block is the named offender).

Reports: a report exists to answer a decision. Format: what it answers (title), the
answer (big), the evidence (small, behind a tap if long). Any report that answers
nothing gets cut in the comp, not hidden in code.

## REORGANIZATION (one home per thing)
- Policy page explodes. It keeps ONLY feature flags (with real feature names, grouped
  Consumer / Admin & Global). Pricing + memberships/bundles move to Plans (one home —
  today it links to Plans while duplicating it). Queues (restock watches, community
  moderation, store requests) move to the pages that own those features. Pulse block
  dies (Live owns members). Intel block dies (Stores > Intel owns it). Kiosk block dies
  (Kiosk tab owns it).
- Live (dash) becomes the morning answer to "is the machine healthy and profitable":
  per-model A/B/C scoreboard — checks, success rate, avg length, cost per check vs the
  5-cent target (green/red) — plus an exceptions list (stores whose last call ended
  no-answer / hangup / bad status), plus the funnel (leads → signups → paying → revenue).
  Credit balances demote to a detail sheet (vendor credits are buyable, not decisions).
  Call-health moves out of the dash into a maintenance sheet. Money sheet dies (Calc
  duplicates it; fold what matters into the scoreboard).
- Users: add sort/filter by plan (comp, pay-as-you-go, each tier). Detail sheet gets
  the template treatment.
- Every page that is prod-only gets the env picker as part of its redesign pass
  (wiring epic below).

## THE PIPELINE
1. CD (via MCP, into docs/design/comps/inbox/ ONLY) produces TWO master comps, not 22:
   the master PAGE pattern and the master SHEET pattern — demonstrated on two guinea
   pigs: Alerts (closest to good today) and the exploded Policy-flags page (worst
   offender). Comps must follow THE TEMPLATE above literally.
2. Owner blesses the masters (or marks changes; CD revises). NOTHING rolls out before
   the bless.
3. Rollout: one task per page in docs/tasks/, in this order: Live · Users · Policy
   (explode) · Plans (absorb pricing) · Stores · Calls/statuses sheets · then the rest.
   Each task = apply template + reorganize per this doc + copy pass (lexicon + no
   dashes; the copy gate enforces) + gap-check against the blessed master + verify-live
   pasted. One page, one chat.
4. WIRING EPIC (parallel, from AUDIT.md): one Admin, two environments. Global env
   picker; every read/write follows it; staging fully quarantined from prod (its calls,
   reports, and money never mix into prod numbers); kill the one-way mirrors' surprise
   behavior (a save in Admin must apply to the environment you're looking at). Staging
   gains everything today manageable only on prod.
5. The audit chat may be consulted read-only for page details; it does no fixes.

## OWNER'S PART (the only three things)
1. Bless or redline the two master comps.
2. Say "unlock <section>" when a rollout task touches frozen ground.
3. Test each redesigned page on his phone; a task closes only when it looks right there.
