# Check status page: the bottom bar, then the alerts list

**System:** site · **Status:** active — §1 + §2 shipped (PR #100), then round 2 07-30 (PR #101): the
wait screen ("Pulling the result", `body.rv-pend`) carries the same bar-clearing strip and parks on the
tail, AND the owner ordered the §4 wait dead: verdict at hang up (`src/voice/elevenlabs.ts` accepts
"processing" with full turns + duration). All driven on the real staging site by relay; iOS paint + one
real Fun check are HIS. §3 alerts NOT started (owner-ordered second). · **Owner-named 2026-07-30.**
**This task IS the unlock authority** for the check-status section of `public/checkit.html` and for
`public/checkit.html` generally: write the exact glob into `.unlock`, fix ONLY that scope, delete it after.

**ORDER IS FIXED BY THE OWNER: everything on the check status page FIRST. Alerts second. Do not
start the alerts work until the check status page is signed off on his phone.**

---

## 1. THE ONE TO GET RIGHT — content slides under Safari's bottom bar

**What he sees (staging, iPhone, Safari):** as each new line of the conversation lands, the page
slides up and the Check wordmark in the footer ends up half-hidden behind Safari's address bar (the
solid grey strip at the bottom).

**The top of the page is NOT in scope.** I flagged the pending text passing under the status bar and
he looked and said there is no issue up there. Do not chase it.

**Root cause.** The live view follows the conversation by scrolling to the very end
of the document (`renderLiveMsg`, `public/checkit.html` ~:5643 — `window.scrollTo({top:
document.body.scrollHeight})`). The document's true end sits behind Safari's bottom bar. On every
other page the CUSTOMER scrolls, and Safari tucks its own bar away when a human scrolls; it does not
do that for a scroll the page performs on itself.

### ⚠️ HOW I GOT THIS WRONG — do not repeat it

I shipped `body.lview main{min-height:100dvh}` (commit `454cfe5`) to force the page tall enough to
scroll, on the theory that iOS only makes its bar see-through over a scrolling page. **The owner
rejected it the same day and it was reverted in `20169ae`.** Why it was wrong:

> The live view's follow-along targets the BOTTOM OF THE DOCUMENT. Any dead space you add below the
> conversation becomes part of that target, so the newest line gets pushed up off-screen and the
> scroll-back-to-the-top reveal at the end is destroyed. He noticed instantly: *"it's worse than it
> was before because it used to scroll and show you the conversation as it was happening in real
> time and once it gets to the bottom then it scrolls you back up to the top and gives the reveal."*

`scripts/qa-tint-lock.mjs` check **14b** now FAILS the push if anything sets a `min-height` on
`body.lview main`. That gate is the memory of this mistake. Do not edit it to make a change pass.

### The fix that should work — BOTH halves, or neither

1. **Move the target.** The follow-along must aim at the NEWEST LINE, not at the end of the document.
   Something like scrolling the last bubble into view with `block:'end'` plus a comfortable margin,
   instead of `scrollTo(document.body.scrollHeight)`. Once the target is the line, dead space below
   it is harmless.
2. **Then add the clear strip.** End the page with a strip the height of Safari's bar so nothing ever
   lands under it. **Do not invent a number** — the repo already measured this once and the constant
   lives in `public/checkit.html` ~:2095: `calc(160px + env(safe-area-inset-bottom))`, with the
   comment *"clears the 120px under-bar overshoot AND lifts the last row a comfortable tap above the
   iOS toolbar (a flush-to-edge link was untappable)"*. Every slide-up sheet already uses this
   recipe. Copy it WHOLE (LAW 1) — half-copying a working pattern is how the zones basket was broken.
**Do them in one push, in that order, and re-check that the reveal still works** — the reveal is:
follow the conversation down live → check ends → page scrolls back to the top → verdict appears.
Break that and he will bounce it again.

### Prove it
Chromium **cannot** show you iOS paint (`docs/team/site/checkpoint.md`, standing lesson). Drive the
follow-along and the reveal locally, then ship one change and say "pushed, check your phone."
Local rig that works: pull the staging env from Railway, run
`DATABASE_URL=file:<scratch>/local.db PORT=88xx npx tsx src/server.ts`, consumer page is `/r`.
Playwright: `import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'` with
`executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`.
**The real check status view is NOT the homepage with `#live` unhidden** — `startLive` (~:5864) also
hides `#builder` and adds `body.lview`. Get that wrong and your screenshots lie; mine did, and he
caught it.

---

## 2. "Too far? Have a local grab it" appears when the feature is OFF

He saw it flash on the pending screen and vanish when the verdict landed, with the feature switched
off on staging. `public/checkit.html` ~:6483 renders it on `F.driverHandoff !== false`. Before the
flags arrive `F.driverHandoff` is `undefined`, which is not `false`, so it shows. **Default it to
hidden until the flags are known.** Check the sibling buttons on that row for the same shape.
It is NOT what makes the verdict slow — he asked, and the answer is no.

---

## 3. THE ALERTS LIST — only after the check status page is signed off

- **Never let the same store be subscribed twice.** He is subscribed to the Fun store twice and got
  two emails for one in-stock result. He deliberately left the duplicate row in place so it can be
  reproduced — **do not delete his data to make it look fixed.** Stop the duplicate at subscribe
  time AND fold the existing duplicates so one store sends one email.
- **Copy change** (ships with its length-checked Spanish in the SAME commit, both lines, no dashes):
  - line 1: `Manage your In Stock alerts.`
  - line 2: `Delete or Pause them below.`
  - (replaces "Every store you're watching." / "Flip each on or off.")

---

## 4. What I changed on the verdict speed, and a question for you

**Shipped `92fb2d4` — "read as it goes".** The reader (the second opinion on what Staff said) used to
start only AFTER a check ended, so the customer sat on "Getting the answer…" while a model that takes
about a second read words we had already had for a while. It now runs DURING the check, off our own
live record, and the finalize paths pick up the finished read.

- New: `src/voice/live-read.ts` (arm at dial · a read per Staff line, one in flight at a time, newest
  wins · released when the verdict is written).
- `src/calls/events.ts` `recordLine` hands each line over through a **registered hook**
  (`setLineHook`), never an import — that module's rule 1 keeps it free of model/db code.
- `consensusFor` (`src/voice/verdict.ts`) takes an optional `room` and uses the finished read when
  there is one; the model call is now the fallback. **The verdict RULE is untouched** — same reader,
  same merge, a disagreement is still an honest "no clear answer" with no charge. Only WHEN our half
  of the pair is computed moved.
- Proof: `scripts/test-live-read.ts` (real keys). Read ready and correct before finalize; the
  finalize merge went 692ms → 1ms with the identical verdict; room released; a line for an unarmed
  room is a no-op. 72/72 `test-call-events`, spec gates ok, tsc clean.
- Also `scripts/time-verdict.ts` — times the reader and the ElevenLabs fetch, so any claim about
  verdict speed is a measurement.

**Measured:** the reader is ~0.9s median (gemini-2.5-flash-lite). It was never the big cost.

**What is still slow, and the QUESTION FOR YOU:** the customer's verdict still waits on **ElevenLabs'
own read**. `GET /pub/result/:cid` (`src/server.ts` ~:3326) will not finalize until
`provider.getConversation(cid)` reports `status === "completed"`, and their post-check analysis
(`analysis.data_collection_results`) cooks for a while after the check ends. Meanwhile the browser
asks once a second and every ask is another round trip to them.

Facts you need before you form an opinion:
- ElevenLabs streams every line to us LIVE (`src/voice/bridge.ts` `user_transcript` /
  `agent_response`) and we write our own copy. **We already have the words.**
- Their read is their model over the SAME words, not over the audio. It is not a better-quality read;
  it is a second model on one transcript.
- The owner's rule (07-29) is that two reads must agree or the customer gets "couldn't tell" and is
  not charged. Any change must keep that rule exactly.
- Their read carries structured flags ours does not: `sold_out`, `does_not_carry`, `too_busy`,
  `shipment_day` (`src/voice/elevenlabs.ts` `normalize`, ~:212). Dropping their read without
  replacing those flags WOULD change customer-visible verdicts. That is the real cost, and it is why
  I stopped and asked instead of building it.
- Also unexamined: the browser polls `/pub/result` every 1s and each tick re-fetches the whole
  conversation from ElevenLabs. Overlapping ticks can enter the finalize branch together.

**RESOLVED 07-30 (owner ruled, in chat):** no new cost, ever. The fix shipped is the gate at
`src/voice/elevenlabs.ts` `getConversation`: EL's "processing" status (phone side over, their analysis
cooking) now finalizes immediately when real transcript turns AND a real duration are present — the
on-demand consensus path (our live read + the word rules) runs at hang up, their read gets its veto
only when already back (webhook still applies it late). Anything with less data waits for "done"
exactly as before. The owner also ruled the words themselves need no end-of-check copy: ours is the
transcript (transcriptPatch already prefers it), theirs only backfills when we recorded nothing.

---

## Rules for this task
- Read WHOLE before touching UI: `docs/design/STYLE_GUIDE.md` + `docs/design/copy/COPY_STYLE_GUIDE.md`.
- Never open `public/checkit.html` whole. `docs/design/INDEX.md` first, then only your line range.
- **One change per push**, smallest first, then "pushed, check your phone" and STOP. He kills anything
  that is not right on sight — a small push dies cheap.
- Torn between two looks? Screenshot both, ask, wait. Never pick for him.
- Say "check", never "call". The person at the store is "Staff".
- `bash scripts/verify-live.sh` output goes below before this task is closed.

**Verify-live output (paste on close):**
```
(none yet)
```
