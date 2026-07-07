# Check — Checkpoint (2026-07-03)

One page that captures **what we built the last few days**, **how the call engine works now**, the
**cost-reduction roadmap**, the **locked pricing**, and the **two builds queued next** — with a block
of open questions at the bottom for you to answer inline before I build them.

> Companion docs: `CALL_ECONOMICS.md` (the cost model + levers), `ROADMAP.md` (the product moat/backlog).
> This doc is the "where we are right now" snapshot; those are the deep dives.

---

## 1. What shipped (last few days)

**Delta — the recorded-agent lane ("tape deck").** A whole new way to run a check that costs ~2½¢
instead of ~5¢. Instead of a live agent talking, Twilio plays pre-recorded Branson clips, a cheap
classifier reads the clerk's reply in ~½ second, and the matching clip plays back. If the call goes
off-script, it escalates to the live agent (Charlie). You tested it and couldn't tell it was two
systems. Lives in **Admin → Fun** as a rehearsal (never dials a real store). *Files: `src/calls/tapedeck.ts`.*

**The mapper — "map until locked."** The system now teaches itself the fastest path to a human at a
chain, then locks that path in as a recipe it can replay forever with **zero AI on navigation** (pure
keypad tones + text-to-speech). Proven live: WinCo mapped to a direct 36-second path, CVS verified at
65s, Family Dollar short-menu bug fixed, dead phone numbers caught. *Files: `src/calls/mapper.ts`,
`src/calls/navigator.ts`, `src/calls/trainer-batch.ts`.*

**ROI calculator (Admin → Calc).** Now models the Delta lane, an escalation slider (what % of Delta
calls fall back to a live agent), a reach slider (pickup rate → wasted-dial cost), and a **per-plan ROI
table** you can slide around — edit prices, checks/month, and expected usage and watch the margin move.

**Reliability + polish.** Fixed the "nobody answered" status bug (the transcript was being read before
it finished loading), the opener-timing bug, a security fix, and a large admin copy/UX overhaul.

**Deploy safety.** Deploys now wait for any live call to finish before restarting (SIGTERM drain, 240s
cap) — so shipping code no longer kills a call in progress.

---

## 2. How the mapping logic works now

The mapper runs a chain through four phases, then locks:

1. **Listen** — call in, say nothing, just hear the whole menu out. Learn what the tree actually says.
2. **Baseline** — reach a human the honest way and time it. This is the "before" number.
3. **Optimize** — try to shave it: press digits earlier, skip prompts, barge through. Each attempt is
   timed against the baseline.
4. **Lock** — the fastest proven path becomes a **recipe** (a fixed sequence of keypad tones + spoken
   lines). From then on the chain replays that recipe with **no AI** — it's mechanical, so it's cheap
   and repeatable.

For chains that are already mapped there's a **verify** phase: replay the locked recipe as a plan and
confirm it still lands on a human (chains change their phone trees; verify catches drift).

Guardrails baked in from the live runs: pharmacy-closed ≠ store-closed (don't bail when the front store
is open), don't hammer "0" when a real path exists, daytime-only calling (with a known-24h allowlist so
WinCo/Sheetz/Wawa/etc. aren't gated), and a safety cap on calls per day per chain.

**Why it matters for cost:** a locked recipe is the cheapest possible navigation — no model tokens at
all until a human picks up. The mapper is how we drive the "dial + wait" part of every call toward $0.

---

## 3. The cost-reduction roadmap (the point of all this)

Goal, in your words: **get our cost per check as low as possible so we can offer this cheap** — not to
squeeze margin, to be able to price it low. Ranked by impact:

1. **Delta as the default lane.** If Delta handles a check start-to-finish, it's ~2½¢. The whole game
   is making Delta handle the *standard* check every time, so the only question left on any call is
   "did we need the live agent?" (see §5 — this is the ROI-certainty lever).
2. **Locked recipes everywhere (the mapper).** Every chain we map removes AI from navigation. Dial +
   hold trends to $0; cost concentrates only in the human-conversation seconds.
3. **Fresh-verdict cache / cross-user dedup.** If we just called this exact store+category minutes ago,
   the next person's check can serve that fresh result instead of re-dialing. One call, many answers.
4. **Queue coalescing.** Multiple people waiting on the same store+category collapse into one call.
5. **Hold-handback.** When we're stuck on hold, hand the line back / park it instead of burning a live
   agent's clock waiting.
6. **Direct lines.** Where a store has a back/department number that skips the whole tree, use it.
7. **Migrate scheduled auto-checks to the bridge lane.** The connect-on-human bridge (agent joins only
   when a human picks up) is already live for consumer checks (~5¢). Scheduled checks still run the
   expensive path — moving them onto the bridge is a straight cost cut.
8. **Script front-loading / script battle** — see below.
9. **IVR report** — a named roadmap item; we've figured out how we'll do this ourselves. *(No detail
   here by design.)*

**Script battle (a.k.a. script tournament).** Run variant openers/scripts against each other on real
calls and keep the ones that get to a confirmed answer fastest with the fewest escalations. The opener
that gets a straight "yeah we got some" in one turn is worth real money at scale; the tournament is how
we find it empirically instead of guessing. Pairs directly with Delta (the winning script becomes the
Delta clip set).

---

## 4. The cost model (so the ROI is legible)

Per-check building blocks (from `CALL_ECONOMICS.md`):

- Twilio: **$0.014/min** of connected call.
- ElevenLabs (Branson voice): **$0.0012/sec** when synthesizing/speaking.
- Model (classifier / brain): **~$0.0002/sec**.
- Overhead: **~$0.001/call**.
- Live agent time: **~8.4¢/min** — this is the expensive ingredient we're trying to *not* use.

Where that nets out today:

- **Bridge (live agent joins at human pickup):** ~**5¢** per connected check. LIVE in prod now.
- **Delta (recorded lane):** ~**2½¢** per connected check when it doesn't escalate.
- **Wasted dials** (nobody picks up) still cost Twilio's connect + our overhead — the "reach" slider in
  the calculator accounts for this, because cost-per-*delivered*-check is what actually matters.

---

## 5. Delta ROI — the certainty argument

Your framing, captured so we build to it:

> *"If Delta could be 100% standard on every single call… then it will be easy for us to figure out ROI,
> because the only uncertainty is: do we need Charlie Checker on a call? But if a scenario happens where
> it doesn't have a response for a particular situation… then we might be back to needing the live agent
> and there's less certainty."*

So the single variable that governs our margin is the **escalation rate** — what fraction of Delta calls
fall through to a live agent. Everything else (dial, nav, standard Q&A) is a fixed, known ~2½¢. That's
why the calculator has an escalation slider: **pick the escalation rate, and the per-check cost — and
every plan's margin — is pinned.** The lower we push escalation (better clips, better classifier, script
battle), the more certain and the cheaper the whole business gets.

One concrete gap you already found in testing: the clerk asked *"what days do you usually get a shipment
in?"* and Delta handled it — but our **live** Branson front-end doesn't even ask that yet. Delta is
surfacing script improvements that feed back into every lane.

---

## 6. Locked pricing (feeds the Stripe wiring + the admin price-editor)

**Monthly plans — 4 tiers.** All premium features are subscription-only (for now).

| Plan      | Price   | Checks / mo       |
|-----------|---------|-------------------|
| Family    | $4.99   | 15                |
| Collector | $9.99   | 30                |
| Hunter    | $19.99  | 100               |
| Operator  | $49.99  | 300               |

**Pay-as-you-go (PAYG):** 10 → 100 checks, price per check slides **99¢ down to 60¢** with volume.

**Premium features — subscription-only; admin-toggleable per tier; all ON by default for now:**
Auto-check · Zone calling · Restock alerts · Check any city (zoom past the 20-mile radius) · Advanced
checks (set & product-type info · multiple products at once · put a product on hold) · Personalize your
agent / clone your voice · Treasure hunts (thrift stores & hobby shops).

**Build requirement:** a tier↔feature **toggle matrix** in admin — turn any feature on/off per tier with
no code change (default: everything on for all paid tiers now). Pairs with the price-editor + the Stripe
entitlements, so what a plan *unlocks* is data you control, not hardcoded.

**Rules:** Delta is the default lane; the live agent is the exception, not the norm.

Next step for pricing: an **admin price-editor** so you can change any monthly price or PAYG rate
yourself and have it push straight into Stripe — no code change, no DevOps ticket. (This is the build
you asked for; it's queued alongside the two prompts below and feeds the DevOps Stripe handoff.)

---

## 7. The two builds queued next

Both are grounded — I've read the code and confirmed what already exists vs. what's new. **I'm holding
until you answer the questions in §8**, so I build them the way you want.

### Prompt 1 — Admin poll-results surfacing
When a check ends "unclear," checkitforme.com shows the user a 4-button poll (In stock / Not in /
Restocking / Unclear). **Confirmed: those answers already persist** — `/pub/feedback` writes to the
`call_feedback` table, and `/api/feedback` already joins them to the call result and flags
disagreements. So this is a **surfacing** build, not new plumbing:

- On each call's detail view: show the user's poll answer next to our verdict, with a **"user disagreed"**
  flag when they contradict us.
- A **filterable list** of all poll responses: date, store, our verdict, user verdict, transcript link.
- A **count badge** for unreviewed disagreements (the training queue).

This is a dedicated **Feedback / Polling** view in Admin whose whole purpose is to **improve our
transcripts + verdicts** — every "user disagreed" row is a training signal we act on.

*Small additions needed: the feedback query doesn't join the store name yet, and there's no "reviewed"
concept yet for the badge — I'd add a `reviewed` flag on `call_feedback`.*

### Prompt 2 — Admin alert contact verification
Restock/auto-check alerts should only fire to a **verified** contact. Today `/pub/watch` stores a watch
with no verification, and alerts send to whatever was typed.

- `/pub/watch`: email → send a verify link; cell → send a 6-digit code + `POST /pub/watch/verify`.
- Alerts (`notifyWatches`) only send to **verified** contacts — add a `verified` column to `watches`.
- Store the verified contact **on the account**, expose it in `/app/me` (email / altContact), add an
  update endpoint that re-verifies on change. **"My Checks" displays the saved contact + lets the user
  change it** — the site already shows "verify your inbox" but has nothing to read/edit until the
  backend returns the saved contact; that's this build.
- The alert itself must **send well**: a nice-looking branded email (Brevo) + a real SMS, not a
  best-effort stub. Copy for both comes from the copy guy — keep the templates copy-swappable.
- Return `verified: true/false` on the watch object.

*Reuses what exists: `startPhoneVerify` / `checkPhoneVerify` (Twilio 6-digit SMS) in `src/auth.ts`, and
the Brevo email path already used for in-stock alerts. New: the email verify-link primitive + the branded
email/SMS templates.*

---

## 7.5 Locked build decisions (owner Q&A, 2026-07-03)

**Feedback / Polling view (Prompt 1):**
- Each row opens the **transcript + the user's poll selection** together, and lets the owner
  **correct/relabel our verdict** right there. Corrections **feed training** — this is the loop that
  makes the system better, not just "mark reviewed."
- Placement: its **own focused section within Calls** (the call log still shows statuses; this is the
  dedicated training/review surface).

**Alert verification + sending (Prompt 2):**
- **Verify once.** A cell is approved at signup; never re-verify to subscribe to a new alert. Re-verify
  **only** when the user changes their number. A logged-in user's phone is already verified — reuse it.
- **Staging** keeps the money-saver (fixed dev code, no paid SMS) exactly like login; **production**
  sends real texts wherever we have permission.
- **Channel per premium module:** the user picks **email, text, or both** for any alert that supports it.

**Text-alert economics (Q5) — proposed model:**
- **Email alerts: free + unlimited for everyone** (Brevo ≈ $0). Default channel.
- **Text alerts: metered, a premium lever** — each SMS has real marginal cost:
  - Twilio A2P 10DLC: ~$0.008 Twilio + ~$0.003 carrier ≈ **~1.5¢ per text** (1 segment).
  - Twilio Verify code: ~5¢ once per phone (signup / number change only — negligible).
- **Sender:** NOT a shared short code (US carriers deprecated those in 2021). Register **A2P 10DLC**
  (compliant, ~$4/mo brand+campaign, unblocks all customer texting); toll-free SMS as an interim if
  10DLC lags. A dedicated short code (~$1k/mo) is overkill until huge volume.
- **Cap by tier** so a power-user following 40 stores can't silently cost $5/mo in texts. Proposed
  monthly text allowance (email stays unlimited beyond it): Family email-only · Collector ~50 ·
  Hunter ~200 · Operator ~1000 (fair use). Bulk pricing drops per-text cost as volume grows.
  **← owner to confirm the allowances.**

**Delta = the active priority.** Dial Delta in until it's reliably good and **apply it to the Branson
testing workflow** so persona testing can be finished — the last piece before the website is done.
Code-side work (tuning needs the owner's live test calls): opener timing so it doesn't talk before
speakerphone, bring the "what days do you restock?" follow-up into the live/Branson flow, and the
classifier/clip-routing fixes from the last test.

---

## 7.6 Mapper — approved adjustments from the first live map (Academy Sports, locked 36s)

The Mapping Operator owns building these (staging-first). Approved, priority order:
1. **Target customer-service / front**, not "any department" — prefer a CS/operator option; fall back to
   a department only when the tree has none (Academy has none). Owner can override the target per chain.
2. **Capture + persist the full menu tree** to the CHAIN (reuse the documented-tree slot) and show it in
   the Tree-Trainer panel. The tree is a chain property (all stores share the IVR) → **map it once per
   chain, validate on 1–2 stores**, don't re-map per store.
3. **Same-store retry** until a human answers or the line is clearly dead (rotating stores pollutes the
   recipe with per-store ring variance).
4. **Gate out non-callable chains**: muted, online-only / no-direct-store (Micro Center = stock:site),
   national call-center chains.
5. **Only dial open stores** — real store hours on top of the 9am–8pm daytime gate.
6. **Persist everything to Admin** (recipe + tree + chosen target + per-attempt log), auditable after the
   session expires.
Plus: **record ring-time variance** (146s vs 36s) so a lucky call doesn't set a misleading benchmark; and
for department-only chains **surface a target-choice** to the owner (pick the desk most likely to know card stock).

---

## 8. Open questions — answer inline (leave your answer under each)

> Copy this section into notes if that's easier. I'll build both prompts the moment these are answered.

### Pricing / ROI

**Q1.** What escalation rate should the ROI/pricing be locked to as the baseline assumption — e.g. do
you want to price assuming Delta handles ~90% of calls solo (10% escalate to live agent), or a more
conservative number until we've measured it on real traffic?

_Your answer:_


**Q2.** For the plans (Starter 15 / Collector 30 / Hunter 100), are those checks **hard caps** (calls
stop at the limit) or **soft** (they keep working and overage bills at the PAYG rate)?

_Your answer:_


**Q3.** PAYG slides 99¢ → 60¢ from 10 → 100 checks. Do you want that curve **linear**, or weighted so
the discount only really kicks in near the top (e.g. stays ~90¢ until 50, then drops)? And do PAYG
checks **expire** or sit in the account forever?

_Your answer:_


**Q4.** Should the admin price-editor be able to create **brand-new** plans/PAYG tiers (that then appear
in Stripe), or only edit the prices of the three existing plans + the PAYG curve? (New-plan creation is
more work but it's the "change anything myself" version you described.)

_Your answer:_


### Prompt 1 — Poll results

**Q5.** The "unreviewed disagreements" badge implies a review action. When you look at a disagreement,
what do you want to *do* with it — just mark it **reviewed/dismissed**, or also **correct our verdict**
(re-label the call, which could feed training)? Simplest is a one-click "mark reviewed"; the richer
version lets you fix the record.

_Your answer:_


**Q6.** Where should the poll-results live in the admin — a **new top-level tab** (e.g. "Feedback"), or
folded into an existing screen (Calls / Dashboard)?

_Your answer:_


**Q7.** Do you want to be **alerted** when disagreements pile up (e.g. a Discord ping / the badge is
enough), or is the in-admin badge sufficient for now?

_Your answer:_


### Prompt 2 — Contact verification

**Q8.** For SMS verification we send a real 6-digit code via Twilio (costs a fraction of a cent each).
Fine to send real texts for this, or do you want it gated behind a flag on staging so we don't pay for
codes while testing? (Staging already has a fixed dev code for phone login — I'd reuse that pattern.)

_Your answer:_


**Q9.** When someone sets a restock alert but **doesn't** finish verifying, what happens to the watch —
do we **hold it inactive** (no alerts until they verify) or **drop it** after some window? Holding is
friendlier; dropping keeps the table clean.

_Your answer:_


**Q10.** The account gets a verified **email** and a verified **altContact** (cell). For alerts, if both
are present, which is the **default** channel — email, text, or send to both? And can the user pick
per-alert?

_Your answer:_


**Q11.** Anything else you want these two builds to do that I haven't captured? (Open field.)

_Your answer:_
