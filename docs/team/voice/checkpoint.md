# Check - Voice — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## 2026-07-14 — lane renamed by the owner: **Echo** (was Ringo). Same lane, same files.

## 2026-07-11 — lane created (transferred from Admin/Addie). Read handoff.md first.

**Current focus:** Delta live test round 2 — the whole D-lane is coded, unit-tested (18/18) and
deployed, but NO human has yet heard a Delta call end to end (audio fork, barge-in, wrapNo tone).
The owner calls the Fun store on staging; the step-by-step script is handoff.md §3.

**State of each lane:**
- **Charlie** — live, carried all 8 of the owner's 07-09 calls, tuned 07-10/11 (no spoken dashes,
  set-question example, unknown-set fallback, restock-day push, "Hello?" on dead-quiet pickup).
- **Delta** — deployed on staging + prod; Fun store (106361) routes to it via "Branson Test" both
  envs. Classifier = groq:llama-3.3-70b-versatile (DELTA_CLASSIFY_MODEL override), llm() falls back
  to gpt-4o-mini on any vendor failure. Clip slots 0-8 incl. 7 hello-nudge + 8 wrapNo. Pre-opener
  wait 3s. deltatap audio fork wired; barge Stops the fork before Connect. NOT verified by ear.
- **Bridge/consumer UI** — synthetic `delta:<session>` id unifies /pub/bridge, /pub/live,
  /pub/result + listen room; answered signal flips the site's connect banner; pending verdict shows
  gray "Getting result…" (never yellow).

**Verified evidence:** tsc 0 · test-delta 18/18 · classifier benched on real lines (groq correct on
all; llama-3.1-8b malformed → rejected) · /api/admin/llm-ping green on staging · owner's call 97
"unclear" root-caused to free-Gemini 429 (fixed by gateway fallback + paid Groq).

**OPEN (priority order):**
1. Owner's Delta round 2 on Fun (staging) — verify by ear: opener timing, live audio, clear-no →
   neutral goodbye, silence nudge, restock-day capture, BARGE on off-script (no doubled audio).
   Tune from that feedback.
2. Barged-then-reopened (>15 min) Delta call shows "in progress" — in-memory session expiry;
   accepted for now, fix if it annoys the owner.
3. Bail enforcement (voicemail/IVR caps) — policy UI exists, live enforcement NOT wired. Bench
   before enabling; master switch stays off.
4. A2P day: set TWILIO_MESSAGING_SERVICE_SID when approval lands → Alerts test → Twilio console
   (error 30034 = not active yet).
5. Delta cost write-up into docs/finance/CHEAP_NAV_ARCHITECTURE.md.

**Traps live in handoff.md §5 — top three:** free-tier keys never in the live path (Gemini 429 =
the "brain unplugged" bug) · always confirm the staging deploy before a test round (old deploy runs
Charlie silently) · any new Twilio <Stream> fork must be <Stop>ped before a barge <Connect>.

**Boundaries with other lanes:** consumer live-call UI = Website (Webbie); Admin call log / testing
tab = Admin (Addie); spoken copy obeys the copy guide (Copper). Voice owns: both call brains,
routing/workflows, the bridge plumbing, verdicts, call cost.
