# Copy Deck — Admin (`admin.checkitforme.com`)

> **Owner:** Check — Copy. I own every word a human reads in this app.
> **Implements:** Check — Admin builds the approved copy into `public/app.html`.
> **Status:** v1 — first full pass. Every screen, every button, every control. Approve, then Admin ships it.

---

## The voice (read this first)

Write like a text from the friend who already did the annoying thing for you. Confident, funny, dead simple.

- **Benefit first.** Say what it does *for them*, then how.
- **ELI5.** If a 10-year-old can't get it in one read, rewrite it.
- **Sounds texted, not branded.** "No answer = no charge." not "Zero-cost on unanswered calls."
- **Banned words:** leverage, seamless, empower, solutions, robust, utilize, streamline. Also jargon with no gloss: IVR, DTMF, E.164, round-robin, COGS, MRR — if a term has to stay (finance), add a plain-English tail.
- **The bar for every line:** (1) a 10-year-old gets it in one read, (2) it sounds like a friend texted it.

This is an operator tool — the owner runs it. So it can use a little shorthand. But the bar doesn't drop: clear beats clever, every time.

---

## How to read this deck

Each screen gets:

1. **Header block** — the Title / Sub / Body rhythm (see spacing rules below). Not every block needs all three.
2. **A copy table** — `Element` · `Now` (what's live) · `New` (approved copy) · `Tooltip / note`. A blank `Now` means it's new.
3. **Empty states** — what shows when there's no data yet.
4. **Tooltips** — a plain-English line for *every* control (button, toggle, dropdown, slider, field). Implement as `title="…"` unless noted.

`✅` = keep as-is. `✏️` = reword. `🆕` = add. `⚠️` = decision for the owner.

---

## Design spec — the box every line has to fit in

Pulled from the live CSS in `public/app.html` + the consumer site (`checkit.html`). Copy is written to *this* type scale and spacing. Don't cram — if a line won't fit one row at these sizes, it's too long; cut it.

### Type scale

| Role | Class | Size / weight | Use for |
|---|---|---|---|
| App title | `header h1` | 17px / 900 | "Admin" in the top bar only |
| **Section header (eyebrow)** | `h2` | 12px **UPPERCASE**, +1.2px tracking, muted, 800, green tick-bar | The one title at the top of each screen |
| **Card title** | `.name` / `.sname` | 15–15.5px / 800, white | The header on every card |
| **Sub** (beside title) | `.meta` inline | 12px, muted, weight 400 | The "— what this is" tail next to a card title |
| **Body / helper** | `.meta` / `.smeta` | 12px, muted `#9a9aac`, line-height 1.5 | The sentence under a header |
| **Form label** | `label` | 11px **UPPERCASE**, +.5px tracking, muted | The label above a field |
| Input / select / textarea | — | **16px** (do not shrink — 16px stops iOS auto-zoom) | Typed values |
| Button | `.act` / `.ghost` | 13px / 700–800 | All buttons |
| Empty state | `.empty` | 13px muted, dashed border, centered, 22px padding | "No X yet" |
| Stat number / label | `.stat .n` / `.l` | 22px / 800 · 11px uppercase muted | The big number tiles |
| Toast | `.toast` | 13px | The bottom confirmation flash |

### Spacing & rhythm (the anti-cram rules)

- **Page:** `main` = 24px top/bottom, 20px sides, max-width 1000px.
- **Card:** 16px padding, 16px radius, 12px gap between cards.
- **Header → body rhythm inside a card:** title has `margin-bottom: 6px`, body `margin-top: 4px`. Keep that breath — title and body should never touch.
- **One header per card.** If a card is doing two jobs, it's two cards.
- **Every screen = Header + (Sub) + Body.** The screen's `h2` is the header. If the screen needs a one-liner before the cards, that's the sub. Cards carry the body.
- **Don't stack two muted lines with no gap.** If helper text runs two sentences, give it `line-height:1.5` (already set) and keep it to ~2 lines max.

### Color = meaning (don't decorate with it)

| Color | Token | Means |
|---|---|---|
| Green | `--green #4ADE80` | Go / in stock / live / good |
| Red | `--red #EF4444` | No-go / not in / remove |
| Amber | `--orange #E89A4A` | Unclear / "maybe" |
| Yellow | `--yellow #FBBF24` | Draft / warning / "test me first" |
| Purple | `--purple #A78BFA` | Admin/secondary accent (selection, the Admin dev agent) |
| Muted | `--muted #6B6B7B` | Neutral / not called yet |

---

## ⚠️ Decisions for the owner (voice-level, flagged once)

These show up live and break the voice or the brand. I'd fix all three — but they're your call:

1. **"Runnr" is leaking into copy.** The Statuses save toast says *"Saved — live in Runnr + Test Bench now"* and a code comment calls the customer *"a Runnr customer."* The consumer brand is **Check It For Me**. → Replace "Runnr" with **"the app"** (or "customers"). I've written the fix into the Statuses section.
2. **The caller is named "Fungie" in transcripts.** Bubbles label the agent *"Fungie."* If that's the agent's on-brand name, keep it. If it's a leftover, it should match whatever we call the caller on the consumer side. → **Confirm the caller's name** and I'll lock it everywhere.
3. **"Tracked categories" screen is orphaned** — it loads (`loadCatalog`) and has copy, but it's not in the nav. → Either wire it into a nav group or retire it. Copy is included below either way.

---

# GLOBAL CHROME

## Top header

| Element | Now | New | Tooltip / note |
|---|---|---|---|
| App title | `Admin` (logo + "Admin") | ✅ `Admin` | — |
| Live dot | green pulsing dot, `title="live"` | ✏️ tooltip → `You're connected — calls update live` | The dot means "live data," say so |
| Clock | running time | ✅ keep | — |

## Sign-in screen

Header block (the modal):

- **Title:** `Admin`
- **Body:** `Enter your email to continue.` ✅

| Element | Now | New | Tooltip / note |
|---|---|---|---|
| Email field | `you@email.com` | ✅ | — |
| Continue button | `Continue →` | ✅ | — |
| Link-sent title | `Check your email` | ✅ | — |
| Link-sent body | `Tap the link we sent to {email}.` | ✅ | — |
| Link-sent note | `Keep this tab open — sign-in is automatic.` | ✅ | — |
| "Use a code" link | `Use a code` | ✅ | Tooltip: `Didn't get the link? We'll text a 6-digit code instead` |
| "Change email" link | `Change email` | ✅ | — |
| Code title | `Check your email` | ✅ | — |
| Code body | `We sent a 6-digit code to {email}.` | ✅ | — |
| Code field | `••••••` | ✅ | — |
| Verify button | `Verify →` | ✅ | — |
| Errors | `Enter a valid email` / `Almost — try again` / `Code did not match` | ✅ all three — already in voice | — |

> Sign-in copy is already clean and on-voice. No changes.

## Two-level nav (group tabs + sub-tabs)

The five top groups, with sub-tabs under each. Labels must be one word where possible (chips don't wrap well).

| Group (now) | New | Sub-tabs (now → new) |
|---|---|---|
| Pulse | ✅ Pulse | God view ✏️→ **Live** · Growth ✅ · Business ✅ · Receipts ✅ |
| Stores | ✅ Stores | Stores ✅ · Map ✅ · Zones ✅ · Phone trees & mute ✏️→ **Phone trees** · Tree Lab ✅ · Tree Trainer ✅ |
| Calls | ✅ Calls | Calls ✅ · Schedules ✅ |
| Voice | ✅ Voice | Labs ✅ · Test bench ✅ · Statuses ✅ |
| Settings | ✅ Settings | Settings ✅ |

Notes:
- **"God view" → "Live."** "God view" is an inside joke, not a label. "Live" says what you'll see: what's happening right now. (Keep the bolt icon.)
- **"Phone trees & mute" → "Phone trees."** The mute lives on the same screen; the title doesn't need to list both. The sub-card already says "quick mute."
- Tooltips on each group tab (optional, `title=`):
  - Pulse → `Today at a glance — calls, money, growth`
  - Stores → `Every store we can call, plus the map and phone trees`
  - Calls → `Recent call results and your auto-call schedules`
  - Voice → `Tune how the caller sounds and what counts as "in stock"`
  - Settings → `Master switches`

## Toasts (bottom flash confirmations)

Keep them short and human. Current set is mostly good; tighten these:

| Now | New |
|---|---|
| `Saved — live in Runnr + Test Bench now` | ✏️ `Saved — customers see this now` |
| `Customers now hear calls live` | ✅ |
| `Live audio is testing-only again` | ✅ |
| `Tick some stores first` | ✅ |
| `Name + phone required` | ✏️ `Add a name and a phone number first` |
| `Pick a store and category` | ✅ |
| `Calling you — answer like the clerk!` | ✅ (great) |
| `Call placed — result will appear shortly.` | ✅ |
| `Mic blocked — allow microphone access` | ✅ |

## "Admin dev" agent (chat bubble, bottom-right)

Header block:
- **Title:** `Admin dev` ✅
- The FAB tooltip (now): `Admin dev — ask me to add a store, look one up, fix details` ✅ keep.

| Element | Now | New | Tooltip / note |
|---|---|---|---|
| Empty state | `Ask me to manage stores by chatting.` + 3 examples | ✏️ see below | — |
| Input placeholder | `e.g. Add a card shop in Bodega Bay, CA that carries One Piece TCG` | ✅ | — |
| Model picker | (dropdown) | — | Tooltip: `Switch the brain — Claude, GPT, or Gemini` ✅ already set |
| Working state | `working…` | ✅ | — |
| Error | `Something went wrong — check the server has ANTHROPIC_API_KEY.` | ✏️ `Couldn't reach the agent. Try again in a sec.` (don't leak env-var names to the operator UI) |

**New empty state:**
> **Tell me what you need — I'll do the clicking.**
> "Add a card shop in Bodega Bay, CA that carries One Piece TCG"
> "Any stores in Sebastopol?"
> "Mark store 1423 verified"

---

# GROUP: PULSE

## Screen: Live  *(was "God view")*

**Header block**
- **Header (h2):** `LIVE` 🆕 (screen currently has no `h2` — add one so it matches every other screen)
- **Sub:** `Everything moving right now — calls, money, cutoffs.`

### Stat tiles (top row)
| Now | New | Tooltip |
|---|---|---|
| `live now` | ✅ | `Calls happening this second` |
| `calls 24h` | ✅ | `Calls placed in the last 24 hours` |
| `confirms 24h` | ✏️ `found 24h` | `Times we confirmed it's in stock (last 24h)` |
| `avg call` | ✅ | `Average length of a call, start to finish` |
| `minutes 24h` | ✅ | `Total call minutes today — this is what we pay for` |
| `calls 7d` | ✅ | `Calls placed in the last 7 days` |

> "Confirms" is jargon-ish. "Found" = we found it in stock. Friendlier, same meaning.

### Card: Live right now
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `🔴 Live right now` | ✅ | — |
| Body (empty) | `No calls in flight.` | ✏️ `No calls happening right now.` | "in flight" is pilot-speak |

### Card: Actions
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `⚡ Actions` | ✅ | — |
| Refresh button | `↻ Refresh` | ✅ | `Pull the latest numbers` |
| Body | `Results ingest + scheduled calls fire automatically — nothing to press here.` | ✏️ `Calls and results update on their own — nothing to press here.` | drop "ingest/fire" |

### Card: Money & cost
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `💰 Money & cost` | ✅ | — |
| `revenue` | ✅ | `Money in, all time` |
| `MRR` | ✏️ `MRR (per month)` | `Monthly recurring revenue — what members pay every month` |
| `COGS` | ✏️ `costs` | `What it costs us to make the calls (phone + voice)` |
| `profit` / `loss` | ✅ | `Money in minus costs` |
| `users` | ✅ | `People who've signed up` |
| `members` | ✅ | `People on a paid monthly plan` |

> Keep MRR (owner knows it) but gloss it. Swap COGS → "costs" — no reason to make the operator translate an accounting acronym.

### Card: Call time & cost
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `Call time & cost` | ✅ | — |
| Body | `Time-to-human (phone-tree nav) vs. talk — ElevenLabs bills the whole connected call, so nav + hold is real cost.` | ✏️ `How long calls take. We pay for the *whole* call — ringing, menus, hold, and talk — so the time spent reaching a person is real money.` | — |
| `avg talk` | ✅ | `Average time actually talking to a person` |
| `avg to human` | ✅ | `Average time spent getting through menus and hold` |
| `avg call` | ✅ | `Average total call length` |
| `total minutes` | ✅ | `All call minutes added up` |
| `calls timed` | ✅ | `How many calls these averages are based on` |
| "Per-store averages" toggle | ✅ | `Open to see the slowest and fastest stores` |
| Empty | `No timed calls yet — this fills in as calls come through.` | ✅ | — |

### Card: Bail library
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `✂️ Bail library — proactive call cutoffs (cost control)` | ✏️ Title: `✂️ Auto-hang-up rules` · Sub: `— cut a call the moment it stops being worth money` | — |
| State chip | `ARMED` / `staged · off` | ✏️ `ON` / `off (not live yet)` | — |
| Body | `Rules that cut a call once it stops being worth money. Master switch stays OFF until bench-tested — nothing changes live calls yet.` | ✏️ `These rules end a call early to save money. The master switch stays OFF until you test it — real calls aren't touched yet.` | — |
| Master toggle | `MASTER — enforce bail rules on live calls (stays OFF until enforcement is wired + bench-tested)` | ✏️ `Master switch — use these rules on real calls` · sub: `Leave OFF until you've tested it` | `Turns every rule below on for real calls. Off by default for safety.` |
| Rule: gotAnswerHangup | `Got the answer → hang up` / `a clear yes/no lands, wrap instantly` | ✅ | `Heard a clear yes or no? Hang up right away.` |
| Rule: voicemailBail | `Voicemail → instant bail` / `recording detected, never leave a message` | ✏️ `Voicemail → hang up` / `Hit a recording? Hang up — never leave a message.` | `If it's a machine, drop the call instantly.` |
| Rule: closedBail | `Closed recording → instant bail` | ✏️ `"We're closed" recording → hang up` | `If the store's after-hours message plays, hang up.` |
| Field: ivrMaxSeconds | `IVR max seconds` | ✏️ `Max seconds in menus` | `Give up if we're stuck in phone menus longer than this` |
| Field: holdMaxSeconds | `Hold max seconds` | ✏️ `Max seconds on hold` | `Hang up after this long on hold` |
| Field: ringMaxSeconds | `Ring max seconds` | ✏️ `Max seconds ringing` | `Hang up if no one answers in this many seconds` |
| Field: maxCallSeconds | `Absolute cap (seconds)` | ✏️ `Hard cap (seconds)` | `No call ever runs longer than this, no matter what` |

> "Bail" is fun but reads as slang an operator might not parse first time. "Auto-hang-up rules" is instantly clear and keeps the scissors icon doing the personality.

### Card: Recent calls
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `📞 Recent calls` | ✅ | — |
| Verdict labels | `in` / `not in` / `no answer` | ✅ | — |
| Empty | `No calls yet.` | ✅ | — |

---

## Screen: Growth  *(section title "Growth & Policy")*

**Header block**
- **Header (h2):** `GROWTH` ✏️ (drop "& Policy" from the eyebrow — too much for a 12px caps label; the cards carry policy)
- **Sub:** 🆕 `How we're growing, and the knobs that run the business.`

### Card: Today's pulse
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `📊 Today's pulse — funnel & engagement` | ✏️ Title: `📊 Today's pulse` · Sub: `— who showed up and what they did` | — |
| Group label | `Funnel` | ✏️ `Sign-ups` | `From first visit to paying` |
| `leads` | ✏️ `visitors` | `People who landed on the site` |
| `signups` | ✅ | `People who made an account` |
| `paying` | ✅ | `People who've paid for a check` |
| `members` | ✅ | `People on a monthly plan` |
| `revenue` | ✅ | `Money in today` |
| Group label | `Activity` | ✅ | — |
| `checks` | ✅ | `Total stock checks run` |
| `last 24h` / `last 7d` | ✅ | `Checks in that window` |
| `confirms` | ✏️ `found in stock` | `Checks that came back in stock` |
| Group label | `Community` | ✅ | — |
| `watching` | ✅ | `People waiting on a restock alert` |
| `kiosk intel` | ✅ | `Kiosk refresh tips shoppers sent in` |
| `scores` | ✅ | `"I scored!" photos posted` |
| `pending` | ✅ | `Photos waiting for your OK` |
| `new leads 7d` | ✏️ `new visitors 7d` | `First-time visitors this week` |
| Empty | `No data yet.` | ✏️ `Nothing to show yet — check back once people start visiting.` | — |

### Card: Restock intel
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `📈 Restock intel — the compounding database` | ✏️ Title: `📈 Restock intel` · Sub: `— what we've learned about when stores get stock` | — |
| `confirmed restocks` | ✅ | `Times we caught a store with stock in` |
| `hit rate (N checks)` | ✅ | `How often a check finds stock` |
| `last 7 days` / `last 30 days` | ✅ | — |
| `Shipment days heard:` | ✅ | `Days clerks told us new stock lands` |
| Table headers | `Store / Region / Hits / Best day / Last` | ✏️ `Store / Region / Found / Best day / Last` | — |
| Empty | `No confirmed restocks logged yet.` / `No intel yet.` | ✏️ `No restocks caught yet — this fills in as calls find stock.` | — |

### Card: Feature flags
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `Feature flags — flip any Lego on/off, live across every subdomain` | ✏️ Title: `Feature switches` · Sub: `— turn features on or off everywhere, instantly` | — |

Flag labels (`FLAG_LABELS`) — these are dense. Rewrite each as a short name + plain gloss:

| Now | New label | Tooltip |
|---|---|---|
| `Connect-on-human — bill only talk-time (don't open the agent until a person answers)` | `Pay only for talk time` | `Don't start the AI until a real person picks up — so we don't pay for menus and hold` |
| `Dog-food hours (night-call voicemails)` | `Night test calls` | `Place test calls at night to hear how voicemails sound` |
| `Driver hand-off demo` | `Driver hand-off (demo)` | `Demo only — hand a call to a driver` |
| `Scheduled shipment-day calls` | `Auto-call on shipment days` | `Call stores automatically on the days they get stock` |
| `Restock alerts` | `Restock alerts` | `Text/email customers the second something lands` |
| `Kiosk intel + rewards` | `Kiosk tips + rewards` | `Let shoppers send kiosk refresh times for a free check` |
| `Share cards` | `Share cards` | `Let people share a "scored it" image` |
| `Multi-product asks` | `Ask about more than one product` | `Let the caller check several products in one call` |
| `Specific-set asks` | `Ask about a specific set` | `Let the caller ask for an exact set, not just "any Pokémon"` |
| inline note | `(leave OFF until you say go)` | ✅ | — |
| inline note | `(bench-test before going live — untested on real calls)` | ✏️ `(test it first — never run on a real call yet)` | — |

### Card: Pricing & rewards
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `Pricing & rewards` | ✅ | — |
| `Per-check price (¢)` | ✅ | `What one stock check costs, in cents` |
| `Minimum top-up (¢)` | ✅ | `Smallest amount someone can add at once` |
| `Free checks (new visitor)` | ✅ | `Free checks a first-timer gets` |
| `Kiosk reward (checks)` | ✅ | `Free checks for sending a kiosk tip` |
| `Membership price (¢/mo)` | ✅ | `Monthly plan price, in cents` |
| `Membership checks/mo` | ✅ | `Checks a member gets each month` |
| `Member per-check (¢)` | ✅ | `What extra checks cost members, in cents` |
| `Finds headstart (min)` | ✏️ `Member head-start (min)` | `Minutes members see a restock before everyone else` |
| `GA4 measurement id` | ✅ | `Google Analytics ID — paste it to track traffic` |
| Save button | `Save pricing` | ✅ | — |

### Card: Advanced policy (raw JSON)
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `Advanced policy (raw JSON)` | ✅ | — |
| Body | `Source of truth. Edits here merge over defaults. Use for packs, finds headstart, privacy, etc.` | ✏️ `The master settings file. Anything you type here wins. For deep tweaks the forms above don't cover.` | — |
| Save / Reload | `Save JSON` / `Reload` | ✅ | `Reload` tooltip: `Throw away edits and reload the saved version` |

### Card: Store CMS — import
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `Store CMS — import` | ✏️ `Import stores` | — |
| Body | `Paste your research JSON (array of stores, or { "stores": [...] }). Upserts by phone; region/timezone auto-derived from state. Set "active": false to soft-remove (e.g. Ralphs).` | ✏️ `Paste your store list (JSON). We match on phone number — same number updates the store, new number adds it. Region and timezone fill in from the state. Set "active": false to hide a store.` | — |
| Import button | `Import stores` | ✅ | — |
| Backfill button | `Backfill regions` | ✏️ `Fill in missing regions` | `Guess the region for any store that's missing one` |
| Result | `✓ N added · N updated · N removed · N skipped` | ✅ | — |
| Error | `Invalid JSON` | ✏️ `That's not valid JSON — check for a missing comma or bracket.` | — |

### Card: Kiosk intel
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `Kiosk intel — crowd-sourced refresh times` | ✏️ Title: `Kiosk tips` · Sub: `— refresh times shoppers sent in` | — |
| Empty | `No kiosk reports yet.` | ✅ | — |

### Card: Restock watches
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `Restock watches — customers waiting on a comeback` | ✏️ Title: `Restock watches` · Sub: `— customers waiting for something to come back` | — |
| Empty | `No active watches.` | ✅ | — |

### Card: Community moderation
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `🏆 Community moderation — approve or remove "I scored!" photos` | ✏️ Title: `🏆 Score photos` · Sub: `— approve or remove what people post` | — |
| Status | `⏳ N awaiting review` / `All caught up` | ✅ | — |
| Buttons | `Approve` / `Hide` / `Delete` | ✅ | `Approve`: `Show this to everyone` · `Hide`: `Take it down (you can re-approve)` · `Delete`: `Remove it for good` |
| Empty | `No community posts yet.` | ✅ | — |

### Card: Store requests
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `🏪 Store requests — "don't see your store?" submissions` | ✏️ Title: `🏪 Store requests` · Sub: `— stores customers asked us to add` | — |
| Status | `⏳ N new` / `All handled` | ✅ | — |
| Buttons | `Mark added` / `Reject` | ✅ | `Mark added`: `You added this store — clear the request` |
| Empty | `No store requests yet.` | ✅ | — |

### Card: Launch waitlist
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `📍 Launch waitlist — out-of-area demand by region (rollout intel)` | ✏️ Title: `📍 Launch waitlist` · Sub: `— where people want us next` | — |
| `N waiting` | ✅ | — |
| Empty | `No waitlist signups yet.` | ✅ | — |

---

## Screen: Business

**Header block**
- **Header (h2):** `BUSINESS` ✅
- **Sub:** 🆕 `The money math — what's coming in, what calls cost.`

### Card: live margins
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `💰 Business — live margins` | ✏️ `💰 Margins — live` | — |
| Sub | `N users · N subs` | ✏️ `N users · N members` | — |
| `Revenue` | ✅ | `Money in, all time` |
| `MRR` | ✏️ `MRR (per month)` | `What members pay every month` |
| `COGS` | ✏️ `Call costs` | `Phone + voice cost to run the calls` |
| `Profit` / `Loss` | ✅ | `Revenue minus costs` |
| `Margin` | ✅ | `Profit as a % of revenue` |
| `Paid calls` | ✅ | `Calls a customer paid for` |

### Card: ElevenLabs credits
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `💳 ElevenLabs credits` | ✏️ `💳 Voice credits` | `Credits the voice service charges per call` |
| Source chip | `live balance` / `estimated · last 31d` | ✅ | — |
| Body | `N credits left of N (N% left)` | ✅ | — |
| Stats | `~N calls left · ElevenLabs bills the whole connected call (ring · IVR · hold · talk)` | ✏️ `~N calls left · we're billed for the whole call — ringing, menus, hold, and talk` | — |
| Warning | `⚠️ This is an estimate: "used" = the last 31 days…` (long) | ✏️ see below | — |
| Plan field | `Plan size (credits/month) …Creator ≈ 100,000…` | ✅ keep gloss | `Your monthly credit allowance — used only until live balance is on` |
| Save | `Save` | ✅ | — |

**New warning copy (shorter):**
> ⚠️ This is an estimate. "Used" counts the last 31 days — including calls from before any plan upgrade — so the % can look off. Want the real number? Turn on **user_read** for this API key in ElevenLabs → API Keys, and this reads your true balance automatically.

---

## Screen: Receipts

**Header block**
- **Header (h2):** `RECEIPTS` ✅
- **Sub:** 🆕 `Shoppers forward a receipt → we verify it and hand them a free check.`

| Element | Now | New | Tooltip |
|---|---|---|---|
| Card title | `📧 Emailed-in receipts — shoppers forward a receipt → verified intel + a free check` | ✏️ Title: `📧 Emailed-in receipts` · Sub: `— forward a receipt, get a free check` | — |
| Status | `N received · N claimed a free check. Receipts must parse (kiosk "Machine ID" or product+total) to land here; a regular store/online receipt usually won't.` | ✏️ `N in · N got a free check. A receipt only lands here if we can read it — a kiosk "Machine ID," or a product plus total. Plain store receipts usually won't.` | — |
| Badge | `✓ free check granted` / `unclaimed` | ✅ | — |
| Empty (status) | `No receipts yet — they appear here once a shopper emails one in and it parses.` | ✏️ `No receipts yet — they show up here once someone emails one in and we can read it.` | — |
| Empty (load fail) | `Could not load receipts.` | ✅ | — |

---

# GROUP: STORES

## Screen: Stores  *(section "retailers")*

**Header block**
- **Header (h2):** `STORE INTEL` ✅ (already the first h2)
- **Sub:** 🆕 `Every store we can call. Search, filter, and call one now.`

### Stat tiles (DB-wide)
| Now | New | Tooltip |
|---|---|---|
| `stores` | ✅ | `Every store in the database` |
| `callable` | ✅ | `Stores with a working phone number` |
| `states` | ✅ | `States we have stores in` |
| `chains` | ✅ | `Different store brands` |

### Card: What they carry
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `What they carry — stores stocking each product` | ✏️ Title: `What they carry` · Sub: `— how many stores stock each product` | — |

### Card: Reports (collapsible)
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `Reports — by type · top regions · most-checked` | ✅ | `Open for store breakdowns` |
| Column heads | `By store type / Top regions / Most-checked stores` | ✅ | — |

### Find a store
| Element | Now | New | Tooltip |
|---|---|---|---|
| Section title | `Find a store` | ✅ | — |
| "Map these" button | `🗺 Map these` | ✅ | `See these search results on the map` |
| Search field | `Search name, city, ZIP — or just pick a filter…` | ✅ | `Type a store name, city, or ZIP` |
| Type filter | `All types` | ✅ | `Filter by kind of store` |
| Region filter | `All regions` | ✅ | `Filter by part of the country` |
| Zone filter | `All zones` | ✅ | `Filter by a zone you've drawn` |
| Product filter | `Any product` | ✅ | `Only stores that carry this` |
| Status filter | `Any status` + options | ✅ (options below) | `Filter by what we know about the store` |
| — `Verified` | ✅ | `We've confirmed this store is real and callable` |
| — `Unverified` | ✅ | `Not checked by a human yet` |
| — `In stock now` | ✅ | `Last call found stock in` |
| — `Open now` / `Closed now` | ✅ | `Based on store hours` |
| — `Online` | ✅ | `Ships nationwide, no single location` |
| — `Muted (chain)` | ✅ | `Hidden from customers` |
| — `Bad / missing number` | ✏️ `No phone number` | `Can't be called — number missing or broken` |
| — `Has kiosk` | ✅ | `Store has a Pokémon kiosk` |
| Sort | `Sort: best match` + options | ✅ | `Order the results` |

### Bulk action bar
| Element | Now | New | Tooltip |
|---|---|---|---|
| Select all | `Select all` | ✅ | — |
| Count | `N selected` | ✅ | — |
| `Mark verified` | ✅ | `Confirm these stores are real and callable` |
| `Mark unverified` | ✅ | `Flag these as not-yet-checked` |
| `Mark online` | ✅ | `These ship nationwide` |
| `Not online` | ✅ | `These have a physical location` |
| `Remove` | ✅ | `Hide these from customers (reversible)` |
| Confirm | `Remove N store(s) from the consumer list? (soft-remove — reversible)` | ✏️ `Hide N store(s) from customers? You can bring them back later.` | — |

### Store cards
| Element | Now | New | Tooltip |
|---|---|---|---|
| Tags | `verified` / `unverified` / `muted` / `no number` / `online` | ✅ | — |
| Category dropdown | (category list) | — | `Pick what to ask about` |
| Call button | `Call now` | ✅ | `Call this store right now and check stock` |
| Empty (no search) | `Search by name, city, ZIP — or pick a Type, Region, Product, or Online to pull stores up.` | ✅ | — |
| Empty (no match) | `No stores match: {filters}.` + `Clear filters` | ✅ | — |
| Region tip | `Tip: online / national stores… usually have no region — clear Region to include them.` | ✅ | — |

### Card: Add a store
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `Add a store` | ✅ | — |
| `Name` | placeholder `Barnes & Noble — Brentwood` | ✅ | `Store name — use "Name — Branch"` |
| `Phone (E.164)` | placeholder `+13105551234` | ✏️ label `Phone` · keep `+1…` placeholder | `Full number with country code, e.g. +13105551234` |
| `Location` | `Brentwood, TN` | ✅ | `City, State` |
| `Timezone` | `America/Los_Angeles` | ✅ | `So calls fire at the right local time` |
| `Phone tree (how to reach the right person)` | textarea | ✅ | `Plain English: what to say at each menu to reach a person` |
| Add button | `Add store` | ✅ | — |

> Drop "(E.164)" from the visible label — it's engineer-speak. The placeholder + tooltip teach the format.

---

## Screen: Map

**Header block**
- **Header (h2):** `STORE MAP` ✏️ (shorten the eyebrow; move the legend to a sub)
- **Sub:** 🆕 `🟢 in stock · 🔴 not in · 🟠 unclear · ⚪ not called yet`

| Element | Now | New | Tooltip |
|---|---|---|---|
| Full title (now) | `Store map — green = in stock, red = not in, amber = unclear, gray = uncalled` | split into header + sub above | — |
| Zoom button | `📍 Zoom to my location` | ✅ | `Center the map on where you are` |
| Footnote | `Stores appear once they have a location (geocoded on import).` | ✏️ `Stores show up once we know their address.` | — |
| Pin popup call | `Call Pokémon` | ✅ | — |
| Pin popup status | `IN` / `not in` / `never called` | ✅ | — |

---

## Screen: Zones

**Header block**
- **Header (h2):** `ZONES` ✅
- **Sub:** 🆕 `Groups of nearby stores you can call all at once.`

| Element | Now | New | Tooltip |
|---|---|---|---|
| Card meta | `{zip} · {radius} mi radius · N stores` | ✅ | — |
| Call zone button | `Call zone` | ✅ | `Call every store in this zone right now` |
| Confirm | `Call every store in {name}? This places real calls to real stores.` | ✅ | — |
| Result | `N calls placed` | ✅ | — |
| Empty | `No zones yet — tell Claude an area and it can build one.` | ✏️ `No zones yet — ask the Admin dev agent to build one from an area.` | ("Claude" → the agent's in-app name) |

---

## Screen: Phone trees  *(section "trees")*

**Header block**
- **Header (h2):** `PHONE TREES` ✏️ (was "Phone trees & mute")
- **Sub:** 🆕 `Teach the caller how to get past a chain's menu to a real person.`

### Card: Phone trees
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `Phone trees` | ✅ | — |
| Body | `How the agent gets through a chain's menu to a person. Set once per chain → applies to every store.` | ✅ | — |
| `Chain` | dropdown | — | `Pick the store brand to set up` |
| `Navigation steps` | textarea, placeholder `Plain English, what to say at each menu…` | ✅ | `Plain English: what to say or press at each menu` |
| `Auto-press shortcut` | `0@3` | ✅ | `Auto-press keys at set times. "0@3" = press 0 at 3 seconds. Chain them: "1@3,0@9". Leave blank for none.` |
| Hint | `0@3 = press 0 at 3s · chain: 1@3,0@9 · blank = none` | ✅ | — |
| `Answer path` | `Unclassified` + options | ✏️ label `How it answers` | `Does a person pick up, or is there a menu?` |
| — `Direct human — picks up` | ✅ | — |
| — `Simple IVR — 1–2 steps` | ✏️ `Short menu — 1–2 steps` | — |
| — `Deep IVR — long tree` | ✏️ `Long menu — lots of steps` | — |
| `Avg tree seconds — time burned before a human` | ✏️ label `Seconds to reach a person` · gloss `— time spent in menus before someone answers` | `Typical seconds of menus/hold before a person` |
| Toggle: repack | `Repack-only chain (e.g. Fairfield) — checks waste the customer's money` | ✏️ `Repack-only chain — they don't sell the real thing, so checking wastes the customer's money` | `Mark chains that only sell repackaged product` |
| Toggle: muted | `Muted — hidden from the consumer store list` | ✏️ `Muted — hidden from customers` | `Hide every store of this chain from customers` |
| Save | `Save chain` | ✅ | `Save — applies to every store of this chain on the next call` |
| `Insert CVS template` | ✅ | `Drop in a ready-made script for CVS phone menus` |
| Status (no tree) | `No tree yet — stores of this chain use only the global rules.` | ✅ | — |
| Status (saved) | `Saved ✓ — applies to every store of this chain on the next call.` | ✅ | — |
| Shortcut error | `Shortcut format: digit@seconds, e.g. 0@3 or 1@3,0@9` | ✅ | — |

### Card: All chains (quick mute)
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `All chains — quick mute` | ✅ | — |
| Body | `Mute a chain → all its stores vanish from every city for consumers, instantly.` | ✏️ `Mute a chain and all its stores disappear from customers everywhere, instantly.` | — |
| Filter | `Filter chains — e.g. Ralph's…` | ✅ | — |
| Mute / Unmute | ✅ | `Mute`: `Hide this chain from customers` |
| Repack / Not repack | ✅ | `Mark this chain as repack-only` |
| Chip: `repack-only` / `tree` / `muted` | ✅ | — |

---

## Screen: Tree Lab  *(section "treelab")*

**Header block**
- **Header (h2):** `PHONE TREE LAB` ✅
- **Sub:** 🆕 `The caller learns each chain's menu from real call transcripts — and you can kick off calls here.`

| Element | Now | New | Tooltip |
|---|---|---|---|
| Body | `How to reach a human at each brand — discovered & documented from call transcripts by {model}. Every call teaches it; you can also trigger calls here. Calls are real — bench-test before relying on it.` | ✏️ `How to reach a person at each brand, learned by {model} from real call transcripts. Every call teaches it. You can also start calls here. ⚠️ These are real calls — test before you rely on it.` | — |
| Count field | `how many brands` (title) | ✅ | `How many brands to call` |
| `Discover N unmapped` | ✏️ `Learn N new brands` | `Call brands we haven't mapped yet and figure out their menus` |
| `Re-verify N mapped` | ✏️ `Re-check N brands` | `Call brands we've mapped to confirm the menu hasn't changed` |
| Refresh | `↻ Refresh` | ✅ | — |
| Stat tiles | `brands / verified / learned / varies / unmapped` | ✅ | `varies`: `Menu changes call to call` · `unmapped`: `Not figured out yet` |
| Row buttons | `Discover` / `Verify` | ✏️ `Learn` / `Re-check` | — |
| Per-row result | `Calling {store} — {kind} running; refresh in a minute` | ✅ | — |
| Batch result | `Placed N call(s)… Results fill in as calls finish — hit Refresh.` | ✅ | — |
| Empty | `No chains.` | ✏️ `No chains yet.` | — |

> "Discover/Verify unmapped/mapped" is engineer-framing. "Learn new brands / Re-check brands" says the same thing to a human.

---

## Screen: Tree Trainer  *(section "trainer")*

**Header block**
- **Header (h2):** `TREE TRAINER` ✅
- **Sub:** 🆕 `Find the fastest path to a person for each chain — watch it happen live, then lock it in.`

| Element | Now | New | Tooltip |
|---|---|---|---|
| Body | `Document the fastest path to a human for each chain. Tap Document — our cheap navigator calls a store, listens, and works the menu (pressing or speaking) until a person answers, then records the recipe + time. Watch it live, then Lock it. Calls are real.` | ✏️ `Find the fastest way to a person for each chain. Tap Find it — a cheap caller dials a store, works the menu (pressing or talking) until someone answers, and saves the steps and the time. Watch it live, then Lock it in. ⚠️ Real calls.` | — |
| Refresh | `↻ Refresh` | ✅ | — |
| Progress | `🔒 N / N locked` | ✅ | `Chains with a saved, locked path` |
| Button: Document | `Document` | ✏️ `Find it` | `Call a store and figure out the fastest path to a person` |
| Button: Re-run | `Re-run` | ✏️ `Run again` | `Try again — maybe find a faster path` |
| No phone | `no phone` | ✏️ `no number` | — |
| Live status | `dialing…` | ✅ | — |
| Live result (win) | `✅ Reached a human in Ns · {type}` + steps | ✏️ `✅ Got to a person in Ns · {type}` | — |
| `🔒 Lock this recipe` | ✏️ `🔒 Lock these steps` | `Save this path as the one we'll use` |
| `↻ Try again (go faster)` | ✅ | `Run it again to see if you can shave time` |
| Live result (fail) | `✖ Didn't reach a human` | ✏️ `✖ Couldn't get to a person` | — |
| `↻ Try again` | ✅ | — |
| Lock toast | `🔒 Locked` | ✅ | — |
| Badges | `🔒 locked / 👀 review / 🟡 learning / ⚪ unmapped` | ✏️ `unmapped`→`not started` | — |
| Empty | `No chains.` | ✏️ `No chains yet.` | — |

---

# GROUP: CALLS

## Screen: Calls  *(section "results")*

**Header block**
- **Header (h2):** `RECENT CALLS` ✅
- **Sub:** 🆕 `Every call and how it turned out.`

| Element | Now | New | Tooltip |
|---|---|---|---|
| Sort | `Sort: newest` + options | ✅ | `Order the calls` |
| — `Outcome — in stock first` | ✅ | `In-stock results on top` |
| Filter banner | `Filtered to one store (from your alert link).` | ✅ | — |
| `Show all` | ✅ | `Clear the filter and show every call` |
| Transcript toggle | `Transcript` | ✅ | `Read the full back-and-forth` |
| Verdict pills | (see Verdict copy section) | — | — |
| Empty | `No calls yet.` / `No calls for this store yet.` | ✅ | — |

---

## Screen: Schedules

**Header block**
- **Header (h2):** `SCHEDULES` ✅
- **Sub:** 🆕 `Set the caller loose automatically on the days stores get stock.`

| Element | Now | New | Tooltip |
|---|---|---|---|
| Card meta | `fires {time} store-local · cap Ns` | ✏️ `runs {time} store time · max Ns per call` | — |
| Pause / Resume | ✅ | `Pause`: `Stop these auto-calls (keep the schedule)` |
| Status dot | on/off | ✅ | — |

### Card: New schedule
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `New schedule` | ✅ | — |
| `Name` | `Thursday B&N Pokémon` | ✅ | `Name it for yourself, e.g. "Thursday B&N Pokémon"` |
| `Category` | dropdown | — | `What to ask about` |
| `Mode` | `Restock — got a shipment in?` / `Carry — do you sell it?` | ✅ | `Restock`: `Ask if new stock came in` · `Carry`: `Ask if they sell it at all` |
| `Time (24h, store-local)` | `09:00` | ✏️ label `Time (store's local time)` · placeholder `09:00` | `When to call, in the store's own timezone. 24-hour, e.g. 09:00` |
| `Days` | Sun–Sat checkboxes | ✅ | `Which days to call` |
| `Question` | `Hi! I was just checking to see if you got a {category} shipment in today?` | ✅ | `What the caller opens with. {category} fills in.` |
| `Clarification / what doesn't count` | textarea | ✏️ label `What doesn't count` | `Spell out what shouldn't count as a yes — e.g. repackaged or off-brand` |
| Create | `Create` | ✅ | — |
| Validation | `Name, time, and at least one day required` | ✏️ `Add a name, a time, and at least one day.` | — |

---

# GROUP: VOICE

## Screen: Labs

**Header block**
- **Header (h2):** `LABS — EXPERIMENTAL` ✏️ → `LABS` (keep eyebrow tight)
- **Sub:** `Store testing and voice tuning moved to Test Bench. This is the playground.` ✅ keep as sub.

### Card: Voice studio
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `🎚️ Voice studio` | ✅ | — |
| Body | `Pick the voice every live store call speaks as — or record a new one and clone it.` | ✅ | — |
| `Live store voice` | dropdown | — | `The voice every real store call uses` |
| `Use for live calls` | ✅ | `Make this the voice for all real store calls` |
| Active line | `Live now: {name}` | ✅ | — |
| Clone label | `Clone a new voice — record ~30–60s of clear speech` | ✅ | `Record 30–60 seconds of clear talking to copy a voice` |
| Record button | `● Record` / `■ Stop` | ✅ | — |
| `Voice name — e.g. Branson, Jared` | ✅ | `Name the new voice` |
| `Clone & save voice` | ✅ | `Make a copy of the recorded voice` |
| Cloning msg | `Cloning… (~20s)` | ✅ | — |
| Success | `✓ Cloned: {name} — select it above to go live.` | ✅ | — |
| Errors | `Name the voice first.` / `Record a sample first.` / `Clone failed` | ✅ | — |

### Card: Talk to me
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `🎙️ Talk to me` | ✅ | — |
| Body | `Call any number in your voice and pick the flow. Great for testing tone or just messing around.` | ✅ | — |
| `Phone number (E.164)` | `+13105551234` | ✏️ label `Phone number` | `Full number with country code, e.g. +13105551234` |
| `First name (optional — e.g. opens with "hey what's up Matt")` | ✅ | `Optional — the caller opens with their name` |
| `Flow` | `Open conversation` / `Pokémon restock check` / `Carry check` | ✅ | `What kind of call to run` |
| `Personality (for open conversation)` | `Professional / Homie / Family` | ✅ | `The vibe for an open chat` |
| `Voice` | dropdown | — | `Try any cloned voice — your live store voice isn't touched` |
| Call | `Call` | ✅ | — |
| Validation | `Enter a phone number` | ✅ | — |

### Card: Live transcript
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `📝 Live transcript` | ✅ | — |
| Status | `Waiting for the call to connect…` | ✅ | — |
| Clear | `Clear` | ✅ | — |

---

## Screen: Test bench  *(section "bench")*

**Header block**
- **Header (h2):** `TEST BENCH` ✅
- **Sub:** 🆕 `Tune the caller safely, hear it, then push it live to every store.`

### Card: LIVE strip
| Element | Now | New | Tooltip |
|---|---|---|---|
| Line | `📡 LIVE on store calls: {values}` | ✅ | `What every real store call is using right now` |
| Draft warning | `● Your draft differs from LIVE — store calls keep using the settings above until you apply.` | ✏️ `● Your draft is different from what's live. Real calls keep the live settings until you apply.` | — |

### Card: Voice & script (DRAFT)
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `🎚️ Voice & script` + `DRAFT` chip | ✅ | — |
| Summary sub | `tune safely → test → push live` | ✅ | — |
| Body | `Edits a draft — real store calls are untouched until you Apply to ALL store calls. Hear it with Call me below.` | ✅ | — |
| `Opening line (use {category}…)` | placeholder `Heyy! I was just checking…` | ✅ | `The caller's first words. {category} fills in Pokémon, One Piece, etc.` |
| `Speed / cadence` slider | `(left = slower & calmer)` | ✅ | `How fast the caller talks` |
| `Warmth / expressiveness` slider | `(left = warmer & more inflection; right = steadier/flatter)` | ✏️ `(left = warm and lively · right = steady and flat)` | `How much feeling is in the voice` |
| `Naturalness ↔ speed` slider | `(left = smoothest/most natural; right = faster but more robotic)` | ✅ | `Trade smoothness for speed` |
| `⏱️ The beat — pause before it replies` | options below | ✅ | `How long the caller waits before answering` |
| — `Normal — snappy, but waits for you to finish (recommended)` | ✅ | — |
| — `Eager — fastest replies (may cut people off)` | ✅ | — |
| — `Patient — long beat, waits for a clear pause (slowest)` | ✅ | — |
| `Voice model — English agents support turbo or flash v2 only` | ✅ | `The voice engine. Turbo sounds natural; Flash is faster but robotic.` |
| `Agent brain (LLM)` | gloss | ✏️ label `The caller's brain` · gloss `— smarter = better calls, cheaper = faster and less` | `Which AI runs the conversation` |
| `Saved scripts` | `save a profile you like, load it back…` | ✅ | `Save a setup you like and load it back anytime` |
| `Load` / `Delete` | ✅ | `Load`: `Put this saved script into the draft` |
| `name this one (e.g. 'warm v2')` | ✅ | — |
| `Save current` | ✅ | `Save these settings as a script` |
| `Save draft` | ✅ | `Save the draft — real calls don't change` |
| `Reload draft` | ✅ | `Throw away edits, reload the saved draft` |
| Draft status | `Draft saved ✓ — store calls unchanged. Hit 📞 Call me below to hear it.` | ✅ | — |
| **`✅ Apply to ALL store calls`** | ✅ | `Make this draft the live voice for every store call` |
| Apply note | `The one global switch — copies this draft (voice + opener + brain) onto the live restock + carry agents. Until you press it, store calls don't change.` | ✏️ `The one big switch. Copies this draft — voice, opener, and brain — onto every real call. Nothing changes until you press it.` | — |
| Apply confirm | `Go LIVE: apply this draft (voice + opener + brain) to ALL store calls?` | ✏️ `Go live? This makes the draft the voice for every real store call.` | — |
| Apply success | `✅ LIVE on N store agent(s) — every store call now uses this.` | ✅ | — |
| `Reset agent script to default` | ✅ | `Put the caller back to the built-in, known-good script` |
| Reset status | `Script reset ✓ — the live agent runs the known-good built-in script again.` | ✅ | — |

### Card: Rotation
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `🔀 Rotation` | ✅ | — |
| Sub | `vary the voice + opener per call so stores don't hear the same thing twice` | ✅ | — |
| Body | `Live store calls round-robin through these. Leave empty to use the single live voice/opener.` | ✏️ `Real calls take turns through these. Leave it empty to use the one live voice and opener.` | — |
| `Opener variants — one per line; {category} fills in…` | ✅ | `One opener per line. Each call uses the next one.` |
| `Voice pool — tick the voices to rotate through` | ✅ | `Tick the voices calls should rotate through` |
| `Save rotation` | ✅ | `Save — real calls start rotating` |
| Saved msg | `Saved — live calls will rotate.` | ✅ | — |

### Card: The test call
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `🧪 The test call` | ✅ | — |
| Sub | `the agent calls YOU as the store` | ✏️ `the caller phones YOU — you play the clerk` | — |
| Body | `Pick the store context, then answer your phone like the clerk. Runs the draft voice with that store's real phone-tree rules. The result records against the store (visible in Results).` | ✏️ `Pick a store, then answer your phone like the clerk. It runs your draft voice with that store's real menu rules, and saves the result against the store (you'll see it in Calls).` | — |
| `Store (records the result against this one)` | dropdown | — | `The result saves against this store` |
| `Category to ask about` | dropdown | — | `What to ask for` |
| `Flow` | `Restock check (verified seller)` / `Carry check (do you sell it?)` | ✅ | — |
| `Decision tree (branches off verified)` | options | ✏️ label `What counts as a yes` | `How picky the caller is about what's "in"` |
| — `General restock — any of it counts, won't ask which set` | ✅ | — |
| — `Specific product — only greens if THAT is in` | ✏️ `Specific product — only a yes if THAT exact thing is in` | — |
| `What specific set / product?` | placeholder `151 booster boxes` | ✅ | `The exact thing that has to be in stock` |
| `Your phone (the agent dials this)` | `+13106662331` | ✏️ label `Your phone` | `The caller dials this number — answer as the clerk` |
| `Voice for this test — ring with any clone; the live store voice is never touched` | ✅ | `Try any voice — your live store voice stays put` |
| `📞 Call me` | ✅ | `Call my phone now and run the test` |
| Validation | `Pick a store and category` / `Enter your phone number` / `Name the specific product, or switch to general` | ✅ | — |

### Card: Preview
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `🔎 Preview` | ✅ | — |
| Sub | `the exact instructions this test will run` | ✅ | — |
| Body | `Assembled live for the store + category picked above: global rules + the chain's phone tree + any store override.` | ✏️ `Built from your picks above: the global rules, the chain's menu steps, and any store-specific tweak.` | — |
| `Refresh preview` | ✅ | `Rebuild the preview from the current picks` |
| Source line | `phone-tree source: {src}` | ✅ | — |

### Card: Test result
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `📝 Test result` | ✅ | — |
| Status | `Waiting for the call to connect…` / `In progress… (Ns)` | ✅ | — |
| Verdict label | `What the customer sees` | ✅ | — |
| Clear | `Clear` | ✅ | — |
| Timeout | `Stopped polling (timed out). Check Results.` | ✏️ `Stopped waiting — check Calls for the result.` | — |

---

## Screen: Statuses

**Header block**
- **Header (h2):** `STATUSES` ✅
- **Sub:** 🆕 `The verdicts customers see after a call. Edit any one — it updates everywhere instantly.`

### Card: What customers see
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `What customers see — for each call outcome` | ✅ | — |
| Body | `Edit the icon, label, color or tone — the consumer + Test Bench verdicts update instantly.` | ✏️ `Change the icon, words, color, or tone. Customers and the Test Bench update right away.` | — |
| Emoji field | `🟡` | ✅ | `The icon customers see` |
| Label field | `Label` | ✅ | `The headline customers see, e.g. "In stock"` |
| Color | color picker | — | `The color for this result` |
| Note field | `one-line note the customer sees` | ✅ | `The one-liner under the headline` |
| Tone | `neutral / green — go / red — no-go` | ✅ | `Sets the vibe: go, no-go, or neutral` |
| Save | `Save` | ✅ | — |
| Save toast | `Saved — live in Runnr + Test Bench now` | ✏️ **`Saved — customers see this now`** | (kill "Runnr") |

### Add a status
| Element | Now | New | Tooltip |
|---|---|---|---|
| Title | `Add a status` | ✅ | — |
| Emoji | `🟡` | ✅ | `Pick an icon` |
| Label | `Label (e.g. Holding one for you)` | ✅ | `The headline` |
| Note | `One-line note the customer sees` | ✅ | — |
| Tone | `neutral (gray) / green — go / red — no-go` | ✅ | — |
| Add | `Add status` | ✅ | — |
| Added msg | `Added ✓ — note: DISPLAY is live, but detecting this situation on calls needs Claude to wire the extraction (tell it what the clerk says).` | ✏️ `Added ✓ — it shows up now, but the caller won't pick this situation out of a call until the Admin dev agent wires it up. Tell it what the clerk says that means this.` | — |
| Validation | `Give it a label` | ✅ | — |

---

## The verdict copy (customer-facing — edited here, shown in Calls + Test result)

These are the lines a customer reads after a call. They live in `customerVerdict()` and the Statuses registry. Already strong and on-voice — light polish only:

| Situation | Label | Note (now) | Note (new) |
|---|---|---|---|
| In stock | `In stock` | `They have it — go get it.` | ✅ |
| In stock (named) | — | `They've got {product} in — go get it.` | ✅ |
| Restock incoming | `Restock incoming` | `Not in now — but a shipment lands {day}. Be first when it drops.` | ✅ (great) |
| Not in stock | `Not in stock` | `They don't have it right now.` | ✅ |
| Sold out | `Sold out` | `They got some in, but it's gone — sold out for now.` | ✅ |
| Doesn't carry it | `They don't carry it` | `This store doesn't sell this category at all.` | ✏️ `This store doesn't sell this at all.` |
| No clear answer | `No clear answer` | `Got through and asked, but no clear yes/no.` | ✅ |
| Nobody answered | `Nobody answered` | `Worked the menu but no one picked up.` / `Rang out — no one picked up.` | ✅ |
| Store closed | `Store closed` | `They're closed right now.` | ✅ |
| Call failed | `Call failed` | `Something went wrong.` | ✏️ `Something went wrong on our end.` |

---

# GROUP: SETTINGS

## Screen: Settings

**Header block**
- **Header (h2):** `SETTINGS` ✅
- **Sub:** 🆕 `The master switches. Flip with care.`

| Element | Now | New | Tooltip |
|---|---|---|---|
| Toggle 1 title | `Never leave voicemails` | ✅ | — |
| Toggle 1 body | `Master toggle — if a call hits voicemail or an automated system, the agent hangs up without leaving a message.` | ✏️ `If a call hits voicemail or a machine, the caller hangs up — never leaves a message.` | `On = always hang up on voicemail` |
| Toggle 2 title | `Customers hear calls live` | ✅ | — |
| Toggle 2 body | `Streams call audio + a hang-up button to every customer. OFF = testing tool only (comp accounts like yours always have it).` | ✏️ `Lets every customer listen in and hang up. OFF = it's a testing tool only (your account always has it).` | `On = customers can listen to their call live` |
| Toggle button | `ON` / `OFF` | ✅ | — |

---

# ORPHANED SCREEN (not in nav — see Decision #3)

## Tracked categories  *(section "catalog")*

**Header block**
- **Header (h2):** `TRACKED CATEGORIES` ✅
- **Sub:** 🆕 `The products we check for, and how many stores carry each.`

| Element | Now | New | Tooltip |
|---|---|---|---|
| Card meta | `carried in {N} stores` / `tracked vertical` | ✏️ `tracked vertical`→`tracked product` | — |
| Stat tile | `stores` | ✅ | `Stores that carry this` |

---

## Loose ends / consistency fixes (for Admin to sweep)

- **"agent" → "caller"** in customer-adjacent copy. Inside admin, "agent" is fine for the AI; but where it's about the phone call, "the caller" reads warmer. (Test bench keeps "Admin dev agent" — that one's a chat agent, leave it.)
- **"Claude" in two empty states** (Zones, Add a status) → the in-app name is **"Admin dev agent."** Use that so the operator knows which button to press.
- **"Runnr"** → "the app" / "customers" everywhere it appears (toast + comment).
- **"consumer"** (e.g. "hidden from the consumer store list") → **"customers."** "Consumer" is a marketing word; "customers" is a human one.
- **Acronyms to gloss or cut in visible labels:** E.164 (cut), IVR (→ "menu"), COGS (→ "costs"), DTMF (already hidden behind "auto-press"). Keep MRR but tail it with "(per month)".
- **Every screen gets one `h2` header + a one-line sub.** Several screens (Live/God view, Growth, Business, Receipts, Schedules, Statuses) currently jump straight into cards. Adding the sub gives each screen the Header → Sub → Body rhythm and the breathing room called for.

---

*End of v1. Mark anything you want changed and I'll revise, then Check — Admin implements. Next up: the consumer site + the texts and emails.*
