# Check - Mapping — CHECKPOINT (current state)
> **Volatile — update at every "Checkpoint".** Newest on top, bullets not prose, under ~80 lines.
> (Full history in git + report-2026-07-10/11.md, unmapped-audit-2026-07-11.md.)

## LAUNCH READINESS (2026-07-16) — 99.90% of stores mapped
- **110,516 of 110,622 covered stores are front-end callable (99.90%).** 87/95 chains. Only **8 chains /
  106 stores (0.10%)** unmapped. Strong go-live position; not a blocker.
- **Mapped this session:** Publix(70) keypad 142s (slow tree but callable — the big one, 1,240 stores) ·
  Woodman's(86) direct 27s · H Mart(131) keypad 49s. (Earlier: Walmart 10s, Office Depot direct ~16s,
  Family Dollar 40s.)
- **Macy's (Toys R Us shop-in-shop) = MUTED** (resolved, owner-approved — main line never reaches the toy
  counter). **Micro Center = muted** (online-only).

## THE 8 STILL UNMAPPED (106 stores) — a PHONE-NUMBER / detection issue, NOT navigation → DD
- H-E-B(84), Lucky(7), FoodMaxx(5), Metro Market(5), Stop & Shop(2), Pak N Save(1), Payless(1), Uwajimaya(1).
- All hit the "no human" wall. **H-E-B proven: our automated calls to 3 different stores captured NOTHING**
  (dial→done, no menu, no human) even though the owner called and heard a full menu → the loaded numbers
  aren't reaching the real IVR. **DD: verify the phone numbers for these 8.** Then Mapping takes one pass.
- **H-E-B barge answer (owner asked):** NO, can't barge 0 at 3s — the line must play its greeting first
  before it accepts the 0. Press 0 works only after the greeting.

## Engine state (LIVE on prod 25be309)
- No-downgrade guard (`6feff66`) + skip-rings-direct (`52d2c77`) promoted + verified. Guard proven: a verify
  re-measure that comes in slower KEEPS the faster lock.
- Independents/co-ops = DIRECT, handled in code (DIRECT_DEFAULT_CHAINS + boot backfill, 0b8d077). Boot pass
  overwrites hand-locks → **don't hand-lock independents.** Tree-mapper SKIPS ringsDirect/answerPath=direct_human.
- Ace = co-op → per-store nav is the long-term fix (backend ask), never one chain tree.

## Staging (RESOLVED by DD) — lock on PROD, it flows down
- The "mapped chains gray on staging" gap is fixed: **staging auto-pulls learned nav from prod every ~3 min.**
  So map on PROD only; **NEVER hand-set nav on staging — it gets overwritten by the sync.** DD also loaded
  real phones + hours for verified-kiosk stores (both envs), so "no store open" from a data gap is gone.

## Open / handed off
- **DD:** verify phone numbers for the 8 unmapped chains (above); Food 4 Less kiosk-only flags; populate
  muted reasons (Amazon/Best Buy/Micro Center = "online only", Aldi = "no store line").
- **Admin:** add "Can't map" as a 3rd mapping state + reason display (spec in unmapped-audit-2026-07-11.md).
- No open sweep. Standing down per owner (2026-07-16).

## #1 TRAP (keep)
- Auto-nav 0-hammers when it can't parse an option → FALSE "no human path". NEVER call a chain dead from an
  auto-caller failure. Method: `trainer/document` → read FULL menuPrompts (human option often LAST) →
  press-test (`barge`+`confirm:true`) → `trainer/lock`. A no-answer ≠ unmappable (may ring direct).
- NEW: "no human (done)" across many stores of a chain + a plain listen capturing NOTHING = a phone-NUMBER
  problem (DD), not a nav problem — don't grind calls, flag the numbers.

## Other traps + owner rules (keep)
- STT garbles digits — press-test each candidate. Recorded greetings false-fire "human" ~8-13s in (can
  mis-lock type:direct). Stored times can be lucky single samples — trust the engine's re-measure.
- Muted = never call. Never push code while a call is live. Independents/single-location = DIRECT (no tree).
  Military = muted. National/online = callTarget:false or muted. Pops owns prod promotes; explicit owner
  naming for prod pushes. Done = demonstrated w/ evidence.

## State
- Prod is go-live ready on mapping (99.90% stores). Recipes live in prod DB; staging mirrors via 3-min pull.
  Remaining 0.10% = 8 micro-chains blocked on DD number verification.
