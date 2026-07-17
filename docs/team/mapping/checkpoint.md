# Check - Mapping — CHECKPOINT (current state)
> **Volatile — update at every "Checkpoint".** Newest on top, bullets not prose, under ~80 lines.

## STATE (2026-07-16) — 99.9% of stores mapped, go-live ready. Nothing running.
- **110,516 / 110,622 covered stores are front-end callable (99.9%).** Only 7 micro-chains / ~105
  stores unmapped (0.1%), and that's a DATA gap, not a mapping gap (see below).
- **Ship path (learned it the hard way):** map on **PROD** (admin.checkitforme.com); learned nav
  syncs prod→staging every 3 min (DD's pipe), so a prod lock shows on staging within a minute.
  **NEVER hand-set nav on staging — it's overwritten.** Checkpoints/docs reach the team only when
  merged to `staging` (session branches don't auto-ship; I merge them myself, never the owner).

## Mapped this stretch (all live on prod)
- Walmart 10s · Office Depot direct ~16s · Family Dollar 40s · Publix keypad 142s (slow tree but
  callable — the big one, 1,240 stores) · Woodman's direct 27s · H Mart keypad 49s.
- Macy's (Toys R Us shop-in-shop) = MUTED (main line never reaches the toy counter; owner-approved).

## The 7 still unmapped — FABRICATED NUMBERS, parked (DD found the root cause)
- H-E-B, Lucky, FoodMaxx, Metro Market, Stop & Shop, Pak N Save, Uwajimaya.
- Their loaded phone numbers were **Google answer-box fabrications** — owner dialed 3/3 bad; DD
  quarantined all 105 to `nophone` on both envs. That's why my calls captured nothing (not a nav
  bug). NEW LAW (DD): phones ONLY from the chain's own store locator or the Google MAPS pin.
- When real numbers land (owner pulling them from store locators, DD ingests), **Mapper takes ONE
  pass** — these are simple single-tree groceries. Payless Foods: 1 store, no number exists → mute/leave.
- **H-E-B nav note for that pass:** press 0 reaches customer service, but ONLY after the greeting
  plays — barging 0 at 3s gets dropped (Mapper tested). Woodman's + H Mart numbers were real (locked).

## Engine state (LIVE on prod)
- No-downgrade guard (`6feff66`) + skip-rings-direct (`52d2c77`) promoted + proven: a verify
  re-measure that comes in slower KEEPS the faster lock (Safeway/Kohl's/Jewel/Dick's held).
- Independents/co-ops = DIRECT, in code (`DIRECT_DEFAULT_CHAINS` + boot backfill). Don't hand-lock
  independents (boot overwrites). Tree-mapper SKIPS ringsDirect / answerPath=direct_human.
- Daily cap = 60 runaway guard + `mapper_daily_cap` setting (not the old 12/day).
- Container reclaim kills local nohup drivers; the mapper RUN survives server-side → drive
  per-check-in off mapper/state, remote branch is truth.

## Sweep results (2026-07-10/11, detail in report-2026-07-10/11.md)
- Big cuts: Ralphs 126→59, Costco 97→35, BJ's 90→34, Menards 94→57, Burlington 78→53, Scheels 59→18,
  Staples 60→29, Marshalls 44→20. Root-cause fix: VERIFY used to re-lock a SLOWER sample over a faster
  recipe (hit 11 chains, owner caught it, all hand-restored) — the guard prevents recurrence.
- AAFES muted (military exchange). Meijer callTarget:false (national call center). CVS skipped (owner).

## Open handoffs
- **DD:** real numbers for the 7 chains → Mapper's final pass. Food 4 Less kiosk-only flags (in flight).
- **Admin:** "Can't map" 3rd mapping state + reason display (spec in unmapped-audit-2026-07-11.md).

## #1 TRAP (keep)
- Auto-nav 0-hammers when it can't parse an option → FALSE "no human path". NEVER call a chain dead
  from an auto-caller failure. `trainer/document` (listen) → read FULL menuPrompts (human option often
  LAST) → press-test (`barge`+`confirm:true`) → `trainer/lock`. A no-answer ≠ unmappable.
- NEW: "no human" across many stores + a plain listen capturing NOTHING = bad NUMBERS (DD), not nav.

## Owner rules (keep)
- Muted = never call. Independents/single-location = DIRECT (no tree). Never push code while a call is
  live. Done = demonstrated w/ evidence. Pops owns prod promotes; explicit owner naming before prod pushes.
