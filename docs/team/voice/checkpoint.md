# Check - Voice — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## 2026-07-16 — STRATEGY LOCKED: launch on Charlie. Delta is built + shelved.

**The decision (owner, honest-assessment call):** launch next week on **Charlie** (live agent).
Delta stays fully built and tested but is NOT wired to any real store. Reasons: at launch volume the
~2.5¢-vs-~5¢ saving is trivial next to first-impression risk; Delta is a tape deck + cheap classifier
that can't reliably detect its OWN confident mistakes (mishears "tin"→"10" and rolls to the next clip
sounding dumb), so a "flawless self-barge" cannot be promised. Charlie degrades gracefully; Delta
degrades badly. Delta's real payoff is at SCALE + with a cache, and it needs a real corpus of clerk
replies to get good — which launching Charlie *generates*. So Charlie-first is the on-ramp to Delta.

- **Fun store (106361) → "Branson Global" (Charlie) on BOTH DBs** (was Branson Test/Delta). Real stores
  already defaulted to Branson Global, so production was Charlie-by-default all along — a one-line
  assignment flip, no rework. Delta now runs on ZERO stores.
- **Now fine-tuning Charlie**, slowly, one change at a time (owner drives persona/voice/workflow in
  Admin so he can tell what moved the needle). Branson Global has NO persona set yet — that's lever #1.
  ⚠️ Branson Global is the LIVE default every real store uses; tuning it tunes production. Fine
  pre-launch (≈no traffic) and it IS the launch workflow, just know it's not a sandbox.

**Delta = DONE & SHELVED (built + unit-tested, NOT live-verified end-to-end; 37 delta cases green):**
- Honors workflow tuning: speed 0.7-1.2 + voice model into clip synth; Beat→endpointing **floored 2s**
  (eager 2 / normal 3 / patient 5 — never cuts a thinker off); Reply-timeout→initial wait (4-20s).
- Patience model (`deltaSilence`, pure+tested): DEAD AIR → "you still there?" (clip 7); clerk asks to
  HOLD/check ("hold on, let me check" = new `hold` label) → "no rush, take your time" + wait quietly;
  long/ambiguous hold or hold music on a real store call → **barge to Charlie**. Never hangs up
  mid-answer (the 07-15 "eager 1s cut me off + hung up before 'it's a tin'" bug is dead).
- Second-read verdict + reconcile NOW wired into Delta finalize (was Charlie-only): conflict → honest
  "no clear answer", not charged; second read fixes ASR product labels. + Twilio ASR `hints` vocab and
  "10/ten→tin" alias in both classifier prompts.
- Rotation is round-robin on shared counters with Charlie (openers, voices, every line slot).
- Barge scope TODAY = off-script question at opener + dragging hold. Does NOT catch confident
  mislabels mid-flow — that's the known Delta ceiling, revisit when Delta goes live.

## 2026-07-14 — lane renamed by the owner: **Echo** (was Ringo). Same files.

**Charlie state:** live, carried the owner's 07-09 calls; no spoken dashes, set-question example,
unknown-set fallback, restock-day push, "Hello?" on dead-quiet pickup. Cheap-lane econ (connect-on-
human bridge + bail rules) already live → ~5¢/call. This is the launch lane; tune persona/voice next.

**SELF-LEARNING = THE priority right after Charlie sounds perfect (owner 07-16, ABOVE Delta).**
Owner's goal: every call makes the system smarter/sharper on its own. Corpus EXISTS — prod has ~107
calls, ~96 completed w/ transcripts+verdicts (~65 with a real in/out answer, 20 "no clear answer").
Feedback plumbing half-built: `call_feedback` table + admin review + a front-end unclear-only survey,
but it has 0 rows (never fed). The auto-vs-owner split we're building to:
- AUTOMATIC (no owner notes): mine transcripts for clerk phrasings per verdict, mishears (tin→10),
  opener answer-rate → auto-score/promote, timing/cost, and the reader-disagreements it already flags.
  Nav/IVR tree learning already self-improves. = anything objective/measurable from the call itself.
- NEEDS THE OWNER: ground truth on ambiguous/wrong verdicts (only a human who heard it knows), and
  taste ("sounded weird/robotic/too fast"). Minimum-effort capture = a MASTER-ACCOUNT front-end flag
  (owner's number) → right/wrong/sounded-weird tap on ANY call → writes the training table.
Build plan (park until Charlie is dialed in): (1) read-only mining pass over existing calls (my lane,
invisible), (2) master-account flag — backend mine, button = Webbie's checkit.html. NOT started.

**OPEN (priority order):**
1. Fine-tune Charlie for launch: persona on Branson Global, voice, opener, pacing — one change at a time.
2. Build the self-learning pass? (owner decision — minimal spec above).
3. Bail enforcement (voicemail/IVR caps): policy UI exists, live enforcement NOT wired; switch stays off.
4. A2P day: set TWILIO_MESSAGING_SERVICE_SID when approval lands (error 30034 = not active yet).
5. Delta live end-to-end verification — deferred until we choose to bring Delta up (post-launch).

**Traps (top three; full list handoff.md §5):** free-tier keys never in the live path (Gemini 429 =
"brain unplugged") · confirm the staging deploy before any test round (old deploy runs the wrong lane
silently) · any new Twilio `<Stream>` fork must be `<Stop>`ped before a barge `<Connect>`.
`DELTA_FU_DEFAULTS` in app.html MUST mirror `DEFAULT_FOLLOWUPS` in tapedeck.ts.

**Boundaries:** consumer live-call UI = Website (Webbie); Admin call log/testing = Admin (Addie);
spoken copy obeys Copper's guide. Voice owns: both call brains, routing/workflows, bridge, verdicts, cost.
