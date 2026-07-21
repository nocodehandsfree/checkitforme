# Check - Mapping — CHECKPOINT (current state)
> **Volatile — update at every "Checkpoint".** Newest on top, bullets not prose, under ~80 lines.
> (Full history in git + report-2026-07-10/11.md, unmapped-audit-2026-07-11.md.)

## STATE (2026-07-21) — map VERIFIED intact on prod. Owner running a live CVS proof call now.
- **95 mapped chains live on prod, every one still carries its recipe (I read all 95 today):**
  45 direct · 41 keypad · 1 voice (CVS) · 87 treeStatus learned/verified. Marquee spot-check all
  correct: CVS `say:no>front>general` 67s · Walgreens press 0×4 34s · Target press 2×2 16s ·
  Walmart press 9 10s · Costco press 1 35s · Publix 142s · Ralphs 59s · Meijer press 0×2 71s.
- **This session = ASSESSMENT ONLY — zero Mapper code/data changes.** Diagnosed the 07-20 zone-call
  CVS/Walgreens/TJ-Maxx failures and reviewed Echo's fix; the MAP was never the problem.
- **99.90% coverage holds** (110,516 of 110,622 stores callable). Only the 8 micro-chains / 106 stores
  are unmapped, and that's a DATA gap (bad numbers), not a mapping gap. Macy's + Micro Center muted.
- **Ship path (unchanged):** map on **PROD**; learned nav syncs prod→staging every 3 min (DD's pipe).
  NEVER hand-set nav on staging — overwritten. ⚠️ Container reclaim reverts the LOCAL tree to stale
  commits — remote is truth; drive per-check-in, never trust the local working copy after a gap.

## CVS ZONE FAILURE — ROOT CAUSE + FIX (Echo's lane, `df1c4c8` on staging — I reviewed it, it's sound)
- **Not the map, not the models.** Bug lived in the connect-on-human (cheap ~5¢) path: the
  "wait for a human before waking the billed agent" guard read `ctx.dtmf`/`ctx.say`, which are NULLED
  at TwiML build before any media frame — so the guard was always-true and VAD ran on MAPPED stores,
  opening the agent on CVS's recorded transfer voice (~16¢). My 07-20 one-liner (`770ffa0`) failed for
  the SAME reason (checked the consumed strings) → reverted, correctly.
- **Echo's fix:** `hadDtmf`/`hadSay` flags survive consumption → VAD now ONLY on fully unmapped stores;
  `connectAtSec` re-anchored by `navEndSec` (subtract nav-TwiML length or the timer aims ~a full menu
  late on CVS). Wired at BOTH placement sites (`server.ts:1039`, `bridge-place.ts:81`) — not inert.
  test-bridge 20/0, tsc clean. **NOT proven live yet** — owner dialing a real CVS now; proof =
  transcript kicks in at pickup, cost ~5¢.
- **Why single checks always worked:** the proven single-check path wakes the agent immediately and
  never leaned on the defer-agent timing. My Zones switched the cheap defer path on broadly and dragged
  these latent timing bugs into daylight. The recipes were always correct.

## Engine state (LIVE on prod)
- No-downgrade guard (`6feff66`) + skip-rings-direct (`52d2c77`): a verify re-measure that comes in
  slower KEEPS the faster lock. Independents/co-ops = DIRECT in code (`DIRECT_DEFAULT_CHAINS` + boot
  backfill); don't hand-lock them (boot overwrites). Ace = co-op → per-store nav is the long-term fix.
  Daily cap = 60 runaway guard + `mapper_daily_cap` setting.

## THE 8 STILL UNMAPPED (106 stores) — BAD NUMBERS, PARKED (owner)
- H-E-B(84), Lucky(7), FoodMaxx(5), Metro Market(5), Stop & Shop(2), Pak N Save(1), Payless(1),
  Uwajimaya(1). Loaded numbers were Google answer-box fabrications (owner dialed them, unrecoverable);
  quarantined to `nophone` both envs. NEW LAW (DD): phones ONLY from the chain's own store locator or
  the Google MAPS pin. When real numbers land, **Mapper takes ONE pass** (simple single-tree groceries).
  H-E-B nav note: press 0 reaches customer service but ONLY after the greeting (barge at 3s dropped).
  Payless Athens: 1 store, no number exists anywhere → mute/leave.

## Open handoffs
- **DD:** real numbers for the 8 chains → Mapper's final pass. Food 4 Less kiosk-only flags.
- **Echo/zones lane:** finish proving `df1c4c8` on a live CVS; TJ-Maxx keypad-tone tool failure
  (`play_keypad_touch_tone failed`) still open — that's the zone-call bridge, not the map.
- **Webby/logs:** call log showed total call LENGTH not time-to-human; per-step seconds now server-
  computed (`180f74e`) — verify it reads right on the next zone run.
- **Admin:** add "Can't map" as a 3rd mapping state + reason display (unmapped-audit-2026-07-11.md).

## #1 TRAP (keep)
- Auto-nav 0-hammers when it can't parse an option → FALSE "no human path". NEVER call a chain dead from
  an auto-caller failure. `trainer/document` (listen) → read FULL menuPrompts (human option often LAST)
  → press-test (`barge`+`confirm:true`) → `trainer/lock`. A no-answer ≠ unmappable.
- NEW: "no human" across many stores of a chain + a plain listen capturing NOTHING = a phone-NUMBER
  problem (DD), not nav — flag the numbers, don't grind calls.

## Owner rules (keep)
- STT garbles digits — press-test each candidate. Recorded greetings false-fire "human" ~8-13s in.
- Muted = never call. Independents/single-location = DIRECT (no tree). Never push code while a call is
  live. Done = demonstrated w/ evidence. Pops owns prod promotes; explicit owner naming before prod push.
- Owner is twitchy about test calls — never dial unless he says go. Don't touch other agents' lanes.
