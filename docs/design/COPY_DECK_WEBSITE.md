# Copy Deck — Consumer Website (`checkitforme.com`)

> **Owner:** Check — Copy. I own every word a human reads.
> **Implements:** Check — Website builds the approved copy into `public/checkit.html`.
> **Status:** v1 — first full pass over the live consumer site. Catalog + polish, not a teardown — the site is already mostly on-voice.

---

## The voice (one line)

Write like a text from the friend who already did the annoying thing for you. **Benefit first. ELI5. Sounds texted, not branded.** The live spine is already perfect — keep it:

> **"Pokémon in stock? We'll check for you."** · **"No answer = no charge."**

**Banned:** leverage, seamless, empower, solutions, robust, streamline, utilize. If a 10-year-old can't get it in one read, rewrite it.

---

## How to read this deck

The site runs on an **i18n map**: every visible string is `t('key', 'English default')` (or a `data-i18n="key"` attribute with the English inline). Spanish lives in a separate `es` map.

So to change a line you change it in **two places**: the English default *and* the Spanish entry for the same key. Each row below gives the **key** so you can find both.

Each screen gets: a **Header block** (Title / Sub / Body rhythm), a **copy table** (`Element · key · Now · New · Note`), **empty states**, and **spacing notes**.

`✅` keep · `✏️` reword · `🆕` add · `⚠️` flag for owner.

---

## Design spec — the box every line fits in

Mobile-first. Pulled from the live CSS in `checkit.html`. Don't cram — if a line won't sit on one or two rows at these sizes, it's too long.

### Type scale

| Role | Class | Size / weight | Use for |
|---|---|---|---|
| Hero headline | `.hero h1` | 30px / 900 (26 small · 46 desktop) | The one big promise up top |
| Verdict title | `.verdict .title` | 25px / 900 (28 desktop) | "In stock!" / "Not in stock" |
| Modal title | `.modal h3` | 20–21px | The title in every pop-up |
| **Step header** | `.step` | 11px **UPPERCASE**, +1.2px tracking, muted, 800 | "① Find your store", section eyebrows |
| Card / store name | `.name` | ~15px / 800 | Store names, card titles |
| **Body / helper** | `.meta` | ~13px, muted | The sentence under a title |
| **Form label** | `.klbl` | 11.5px / 700, muted | Label above an input |
| Input / select | — | **16px** (never shrink — stops iOS auto-zoom) | Typed values |
| Primary button | `.cta` | 16px / 900 (17 desktop), full-width green | The main action |
| Small button | `.cta.sm` | 15px | Modal actions |
| Footnote | `.foot` | 12px muted, centered (13 desktop) | "No answer = no charge" line |
| Tiny tag | `.tickcopy` / eyebrow | 9.5–10.5px UPPERCASE | "DEMO", "Verified intel", "copy" |

### Spacing & rhythm (anti-cram)

- **Modals** cap at 400–460px wide. Keep titles to one line at 20px.
- **Step → body breath:** `.step` has 14px bottom margin. Don't let a step header touch its content.
- **One promise per card.** Hero = one headline. Result = one verdict. Don't stack two asks in one modal.
- **Every flow = Title + (Sub) + Body.** Modals already do this well (eyebrow → h3 → meta). Keep it.
- **Helper lines:** 1–2 lines max at 13px. If it runs 3+, cut it.

### Color = meaning

Same tokens as the rest of the family: green `#4ADE80` = in stock / go · red `#EF4444` = not in / no-go · amber `#FBBF24` = unclear · orange `#F59E0B` = restock-soon · purple `#A78BFA` = member/secondary accent · muted `#6B6B7B` = neutral.

---

## ⚠️ Flags for the owner (site-wide)

1. **Footer reads "Fungibles powered by Fungibles."** On the apex it should be the brand name powered by Fungibles. The brand name (`#footBrand`) is defaulting to "Fungibles" instead of the injected brand → looks like a bug. **Fix:** "**Check It For Me** powered by **Fungibles**". Confirm the per-brand value.
2. **"Fungie" is the caller + the membership ("Fungie+ member perk").** Consistent with admin — keep it. Just confirming it's intentional so I lock it everywhere (it is, per your note).
3. **Receipt inbox is a Gmail address** shown to customers: `restocktimer@gmail.com`. Works, but a branded address (e.g. `receipts@checkitforme.com`) reads more trustworthy. Your call — not a copy blocker.

---

# GLOBAL CHROME

## Header

| Element | key / id | Now | New | Note |
|---|---|---|---|---|
| Account pill (signed out) | `#creditN` | `1 free` | ✅ | Shows free-check count |
| Product switcher | `#vsw` | (logo dropdown) | ✅ | Tooltip: `Switch product` ✅ |

## Finds ticker (live social proof)

| Element | key | Now | New | Note |
|---|---|---|---|---|
| In-stock tick | `tick.*` | (live "found" scroll) | ✅ | — |
| Restock tick | `tick.restock` | `Restock coming` | ✅ | — |

## Footer

| Element | key | Now | New | Note |
|---|---|---|---|---|
| Scores link | `foot.success` | `Scores` | ✅ | — |
| About / FAQ / Contact / Terms / Privacy | `foot.*` | ✅ | ✅ | Open in-app sheets, never navigate away — good |
| Powered-by | `#footBrand` | `Fungibles powered by Fungibles` | ✏️ `{Brand} powered by Fungibles` | see Flag #1 |

## Toasts (already strong — keep)

| key | Now | New |
|---|---|---|
| `auth.welcome` | `✓ You're in` | ✅ |
| payment | `🎉 Payment received — adding your credits…` | ✅ |
| `toast.storethanks` | `🙌 Thanks! We'll work on adding that store` | ✅ |
| `wl.done` | `🙌 You're on the list — we'll reach out the moment we launch near you` | ✅ |
| `toast.callgone` | `That call is no longer available` | ✅ |
| `sch.canceled` | `Auto-check canceled` | ✅ |

> The toast voice is dialed in. No changes.

---

# HOME (the Builder)

## Hero

**Header block**
- **Title (`.hero h1`):** brand-injected (`__BRAND_HEADLINE__`). Apex page title is `Check It For Me — Is it in stock?` ✅
- Keep the headline to the one-line promise. The voice target is **"Pokémon in stock? We'll check for you."**

## Trust strip

| Element | key | Now | New | Note |
|---|---|---|---|---|
| Step 1 | `trust.pick` | `Find a store` | ✅ | — |
| Step 2 | `trust.call` | `We check, live` | ✅ | — |
| Step 3 | `trust.answer` | `Get proof` | ✅ | three-beat promise, on-voice |

## Out-of-checks upsell

| Element | key | Now | New | Note |
|---|---|---|---|---|
| Title | `#upsell_title` | `You're out of checks` | ✅ | — |
| Body | `up.go` | `Plans from $4.99/mo — or grab a pack.` | ✅ | — |
| Button | `up.plans` | `See plans` | ✅ | — |

## Mode tabs

| key | Now | New | Note |
|---|---|---|---|
| `mode.call` | `Check a store` | ✅ | — |
| `mode.kiosk` | `Kiosks` | ✅ | — |

## Find your store

| Element | key | Now | New | Note |
|---|---|---|---|---|
| Step | `find.step` | `① Find your store` | ✅ | — |
| Search | `search.ph` | `Search by store or city…` | ✅ | — |
| Map toggle | `#maptoggle` | `Map` | ✅ | Tooltip: `See stores on a map` |
| Find-me button | — | (icon) | — | Tooltip: `Find stores near me` ✅ |
| Radius label | `find.radius` | `Search radius` | ✅ | — |
| Kiosk hint | `kioskhint` | `At a kiosk? Get a free check` + `Use our email at checkout, or forward your receipt →` | ✅ | on-voice |

## What are you hunting

| Element | key | Now | New | Note |
|---|---|---|---|---|
| Step | `cat.step` | `② What are you hunting?` | ✅ | great |
| Step note | `cat.note` | `— tap one or more` | ✅ | — |
| Specific | `cat.specific` | `Anything specific?` | ✅ | — |
| Specific note | `cat.specific.note` | `— optional, pins the exact product` | ✅ | — |

## Check button + charge promise

| Element | key | Now | New | Note |
|---|---|---|---|---|
| Check CTA | `cta.check`/`cta.for`/`cta.checkunit` | `Check {Store} for {category} · 1 check` | ✅ | — |
| Charge foot | `charge` | `No answer = no charge. You always get the verdict.` | ✅ | **the line. don't touch.** |

## Auto-checks card (member)

| Element | key | Now | New | Note |
|---|---|---|---|---|
| Step | `sched.step` | `📅 Your auto-checks` | ✅ | — |
| Step note | `sched.step.note` | `— we call on shipment days` | ✅ | — |

## Demo (collapsible)

| Element | key | Now | New | Note |
|---|---|---|---|---|
| Chip | `demo.chip` | `DEMO` | ✅ | — |
| Calling line | `demo.call` | `… Calling Target` | ✅ | — |
| System note | `demo.sys` | `Navigating phone tree…` | ✏️ `Working through the phone menu…` | "phone tree" is our word, not theirs |
| Agent line | `demo.thanks` | `Perfect, thanks!` (labeled **Fungie**) | ✅ | — |
| Proof | `demo.proof` | `Real person · 2 min ago · full transcript as proof.` | ✅ | — |

## Earn free checks (collapsible)

| Element | key | Now | New | Note |
|---|---|---|---|---|
| Summary | `earn.summary` | `Earn free checks` | ✅ | — |
| Sub | `earn.sub` | `Help the hunt and we load you up with free minutes — random winner picked each week.` | ✏️ `Help the hunt and we'll load you up with free checks — random winner picked each week.` | "minutes" vs "checks" — the product currency is **checks**; "minutes" is inconsistent |
| Add store | `earn.store` / `earn.store.sub` | `Add your store` / `Put a store on the map, earn a free call.` | ✏️ sub → `Put a store on the map, earn a free check.` | same: "call" → "check" for consistency |
| Refer row | `ref.row` | `Invite a friend — you both get a free check` | ✅ | — |
| Refer sub | `ref.sub2` | `They join with your link and run one check — free checks for both of you.` | ✅ | — |
| Share tiles | `ref.t.text/post/more` | `Text` / `Post` / `More` | ✅ | — |
| Copy label | `ref.copy` | `copy` | ✅ | — |

> **Consistency call:** the app's unit is a **"check."** "Free call" / "free minutes" slip in a few places. Standardize on **check** everywhere a customer sees it. (Internally it's still a call — that's fine.)

## Scores row

| key | Now | New | Note |
|---|---|---|---|
| `scores.title` | `Scores from the hunt` | ✅ | — |
| `scores.post` | `Post yours →` | ✅ | — |

---

# LIVE (the call in progress)

**Header block**
- **Title (`.phase`):** `Connecting…` ✅

| Element | key | Now | New | Note |
|---|---|---|---|---|
| Mute banner | `live.mute` | `🔇 Flip your phone off silent so you can hear the call` | ✅ | clear + kind |
| Connecting | `live.connecting` | `Connecting…` | ✅ | — |
| Live audio | `live.live` | `🔊 LIVE — you're hearing the call now` | ✅ | — |
| Hang up | `live.hangup` | `■ Stop & hang up` | ✅ | — |
| Proof header | `live.proof` | `🔴 Live — the conversation as it happens` | ✅ | — |
| Foot | `live.foot` | `Hang tight — stores pick up, get put on hold, and chat. Worth the 2 minutes.` | ✅ | reassuring, on-voice |

> Live screen is excellent. No changes.

---

# RESULT (the verdict)

**Header block**
- **Title (`.verdict .title`):** the verdict (below). This is the payoff screen — keep it big, one line, color-coded.

### Verdicts
| Situation | key | Now | New | Note |
|---|---|---|---|---|
| In stock | `v.in` / `note.in` | `In stock!` / `They have it — go get it.` | ✅ | — |
| In stock (named) | `note.in.named` | `They have {product} in — go get it.` | ✅ | — |
| Not in stock | `v.out` / `note.out` | `Not in stock` / `They don't have it right now.` | ✅ | — |
| Restock incoming | `v.soon` | `Restock incoming!` | ✅ | — |
| Sold out | `v.soldout` / `note.soldout` | `Sold out` / `Came in, but it's already gone. Worth catching the next shipment.` | ✅ | — |
| Doesn't carry | `v.nocarry` / `note.nocarry` | `They don't carry it` / `This store doesn't carry {category} — try another.` | ✅ | — |
| Multi-cat: have | `res.have` | `Here's what they have` | ✅ | — |
| Multi-cat: none | `res.nonein` | `None in stock` | ✅ | — |
| Per-cat labels | `res.percat.in/out/unk` | `in stock` / `not in stock` / `no clear answer` | ✅ | — |

### Proof + actions
| Element | key | Now | New | Note |
|---|---|---|---|---|
| Proof header | `res.proof` | `Proof — what the clerk said` | ✏️ `Proof — what they said` | drops "clerk" — see sweep |
| Translate | `res.translate` | `Translate` | ✅ | — |
| Share | `res.share` | `Share this find` | ✅ | — |
| Driver hand-off | `res.driver` | `Too far? Have a local grab it` | ✅ | great |
| Post score | `res.score` | `Grabbed it? Post your score` | ✅ | — |
| Check another | `cta.another` | `Check another store` | ✅ | — |
| Free-check used | `res.free` | `That was your free check 🎯` | ✅ | — |
| Sign-up CTA | `res.signup` | `Sign up & keep checking` | ✅ | — |
| Powered-by foot | `res.poweredby` / `res.used` / `res.nocharge` | `Powered by Fungibles · 1 check used` / `No charge for this one` | ✅ | — |

### Online-stock (sell-meta, non-callable chains)
| key | Now | New | Note |
|---|---|---|---|
| `sm.in` | `In stock online now` | ✅ | — |
| `sm.low` | `Low stock online` | ✅ | — |
| `sm.out` | `Out of stock online` | ✅ | — |

> Result screen is the best-written part of the site. Leave it.

---

# MODALS

## Free-check gate (lead)

**Header block:** eyebrow (mark) → **Title** → **Body**.

| Element | key | Now | New | Note |
|---|---|---|---|---|
| Title | `lead.title` | `Your first call is free` | ✏️ `Your first check is free` | "call" → "check" (see consistency note) |
| Body | `lead.sub` | `Just your email. No card.` | ✅ | — |
| Email | — | `you@email.com` | ✅ | — |
| CTA | `lead.cta` | `Place my free call →` | ✏️ `Run my free check →` | — |
| Error | — | (validation) | ✅ | — |

## Sign in / sign up (auth)

| Element | id/key | Now | New | Note |
|---|---|---|---|---|
| OAuth divider | `auth.or` | `or use your cell` | ✅ | — |
| Phone field | `#auth_phone` | `(555) 123-4567` | ✅ | — |
| Continue | `#auth_send` | `Continue →` | ✅ | — |
| Link sent title | — | `Check your email` | ✅ | — |
| Link sent body | — | `Tap the link we sent to {email}.` | ✅ | — |
| Link note | — | `Keep this tab open — sign-in is automatic.` | ✅ | — |
| Waiting | — | `Waiting for you to tap the link…` | ✅ | — |
| Resend / Use a code / Change email | — | ✅ | ✅ | — |
| Code title | — | `Check your texts` | ✅ | — |
| Code body | — | `We texted a 6-digit code to {phone}.` | ✅ | — |
| Verify | `#auth_verify` | `Verify →` | ✅ | — |
| Errors | `err.phone/usnum/ratelimited/code/generic` | `Enter a valid US mobile number` / `US mobile numbers only for now` / `Too many tries — give it a minute` / `Enter the 6-digit code` / `Something went wrong — try again` | ✅ | all clean |

> Auth copy is already on-voice and clear. No changes.

## Account sheet

| key | Now | New | Note |
|---|---|---|---|
| `acct.checks` | `My checks` | ✅ | — |
| `acct.more` | `Get more checks` | ✅ | — |
| `acct.signout` | `Sign out` | ✅ | — |
| `acct.zero` (ES exists) | `0 checks — you're at zero. Reload to keep going.` | ✅ | confirm EN default matches |

## Buy / plans

**Header block**
- **Title (`#buy_title`):** `Get more checks` ✅
- Premium-gated title: `buy.premium.title` `That's a member perk ⭐` ✅ · lead `buy.premium.lead` `Restock alerts & auto-checks come with membership — we watch the shelves so you don't have to.` ✅ (great)

| Element | key | Now | New | Note |
|---|---|---|---|---|
| Monthly | `plan.monthly` | `Monthly` | ✅ | — |
| Annual | `plan.annual` | `Annual · save 17%` | ✅ | — |
| Scout | name + `plan.p1` | `Scout — Restock alerts` | ✅ | $4.99 / 5 checks |
| Hunter | name + `plan.p2` | `Hunter — + Auto-checks on shipment days` | ✅ | $9.99 / 10 |
| Flipper | name + `plan.p3` | `Flipper — + Specific products & multi-asks ("No Pokémon? What about One Piece?")` | ✅ | $19.99 / 20 |
| Whale | name + `plan.p4` | `Whale — + Zone sweeps — every store near you, one tap` | ✅ | $49.99 / 50 |
| Most popular | `plan.popular` | `most popular` | ✅ | — |
| Checks/mo | `plan.checksmo` | `checks/mo` | ✅ | — |
| Active | `plan.active` | `ACTIVE` | ✅ | — |
| Founder | `plan.founder` / `.sub` | `Founder — unlimited` / `All tiers, all features, forever.` | ✅ | — |
| Need more | `plan.upsep` | `Need more firepower?` | ✅ | on-voice |
| Cycle note | `plan.cycle` | `Billed monthly · cancel anytime` | ✅ | — |
| Soon | `plan.soon` | `That tier opens this week — Scout monthly is live now` | ✅ | — |
| Secure | `buy.secure2` | `Secure checkout with Stripe` | ✅ | — |

> Plan names (Scout/Hunter/Flipper/Whale) are a great ladder — keep. All on-voice.

## Watch this store

| key | Now | New | Note |
|---|---|---|---|
| `watch.title` | `Tell me when it's back` | ✅ | — |
| `watch.sub` | `We'll ping you the instant anyone confirms it in stock here.` | ✅ | — |
| `watch.ph` | `email or phone number` | ✅ | — |
| `watch.cta` | `Watch this store →` | ✅ | — |

## Auto-check (schedule)

| Element | key | Now | New | Note |
|---|---|---|---|---|
| Eyebrow | `sch.perk` | `Fungie+ member perk` | ✅ | — |
| Title | `sch.title` | `Auto-check on shipment days` | ✅ | — |
| Body | `sch.body` | `We call {store} on shipment days. You get pinged the second {cat} land. 1 check per call.` | ✅ | — |
| Days label | `sch.days` | `Which days? — leave all off to use the store's known shipment day` | ✅ | — |
| Time | `sch.time` | `Earliest call time` | ✅ | — |
| Where | `sch.where` | `Where do we alert you?` | ✅ | — |
| CTA | `sch.cta` | `Turn on auto-check →` | ✅ | — |

## Don't see your store (store request)

| Element | key | Now | New | Note |
|---|---|---|---|---|
| Title | `sr.title` | `Don't see your store?` | ✅ | — |
| Sub | `sr.sub` | `Tell us which store to add — when it goes live, your next call is free.` | ✏️ `…your next check is free.` | "call" → "check" |
| Name | `sr.name` | `Store name — required` | ✅ | — |
| City | `sr.city` | `City & state` | ✅ | — |
| Note | `sr.note` | `Anything else — optional` | ✅ | — |
| Email | `sr.email` | `Your email — optional, so we can tell you when it's live` | ✅ | — |
| Submit | `sr.submit` | `Submit store →` | ✅ | — |
| Error | `err.storename` | `Add the store name` | ✅ | — |

## Launch waitlist

| key | Now | New | Note |
|---|---|---|---|
| `wl.title` | `Get notified when we launch here` | ✅ | — |
| `wl.sub` | `Drop your email or number — the second we go live in your area, you'll be first to know.` | ✅ | — |
| `wl.ph` | `email or phone number` | ✅ | — |
| `wl.cta` | `Join the list →` | ✅ | — |
| empty.far.title | `We're not in your area… yet` | ✅ | — |
| empty.far.cta | `🔔 Notify me when you launch here` | ✅ | — |

## Share the find

| key | Now | New | Note |
|---|---|---|---|
| `share.title` | `Share the find` | ✅ | — |
| `share.sub` | `Tell your crew before it sells out.` | ✅ | on-voice |
| `share.post` / `share.sms` / `share.copy` | `𝕏 Post` / `💬 Text it` / `Copy` | ✅ | — |

## Post your score

| Element | id | Now | New | Note |
|---|---|---|---|---|
| Eyebrow | — | `Show the crew` | ✅ | — |
| Title | — | `You scored!` | ✅ | — |
| Body | — | `Snap your score and post it to the community wall.` | ✅ | — |
| Photo / Caption / Handle | — | `Pulled a Charizard at the Target on Sunset!` etc. | ✅ | placeholders are perfect |
| Submit | — | `Post to the wall →` | ✅ | — |

(Same fields appear in the homepage composer: `sc.where` `Where'd you score?`, `sc.what` `What did you get?`, `sc.photo` `Add a photo of your score`, `sc.postit` `Post it →` — all ✅.)

## Kiosk receipt = free check

| Element | key | Now | New | Note |
|---|---|---|---|---|
| Eyebrow | `rcpt.tag` | `Verified intel` | ✅ | — |
| Title | `rcpt.title` | `Kiosk receipt = free call` | ✏️ `Kiosk receipt = free check` | "call" → "check" |
| Step 1 | `rcpt.s1` | `At the kiosk? Enter our email at checkout — the receipt comes straight to us.` | ✅ | — |
| Step 2 | `rcpt.s2` | `Got the receipt in your inbox? Forward it to us.` | ✅ | — |
| Email | `#rcpt_email` | `restocktimer@gmail.com` | ⚠️ see Flag #3 | — |
| Waiting | `#rcpt_msg` | `Waiting for your receipt…` | ✅ | — |

## Report a kiosk refresh

| Element | key | Now | New | Note |
|---|---|---|---|---|
| Eyebrow | `k.tag` | `Wisdom of the crowd` | ✅ | — |
| Title | `k.title` | `Report a kiosk refresh` | ✅ | — |
| Body | `k.sub` | `Spotted a Pokémon kiosk that restocks on a schedule? Drop its timing — every report earns you a free check.` | ✅ | — |
| Which | `k.which` | `Which store & location` | ✅ | — |
| Minutes | `k.minutes` | `Refresh minutes — when it drops, past each hour` | ✅ | — |
| Every | `k.every` | `Every…` | ✅ | — |
| Not sure | `k.notsure` | `not sure` | ✅ | — |
| Where | `k.where` | `Where do we send your free check?` | ✅ | — |
| CTA | `k.cta` | `Submit & claim my free check →` | ✅ | — |
| Errors | `k.err.*` | `Tell us what store and location` / `Add at least one refresh minute (e.g. :03)` / `Add an email or phone for your free check` | ✅ | — |
| Thanks | `k.thanks*` | `🎁 Thanks! {n} added` / `🎁 Thanks! Your free check is ready — go check a store` / `🙌 Thanks for the tip!` | ✅ | — |

## In-app page sheet (About / FAQ / etc.)

| Element | id | Now | New | Note |
|---|---|---|---|---|
| Title / body | `#pg_title` / `#pg_body` | (server content) | — | Make sure About/FAQ copy follows this same voice — review separately when that content lands |

---

## Site-wide consistency fixes (for Website to sweep)

1. **Scrub "Clerk" and "Runnr" from anything a human reads** (owner: both are dead — Clerk the sign-in service is gone; Runnr is the old name).
   - `res.proof` `Proof — what the clerk said` → `Proof — what they said`.
   - Transcript speaker label **"Clerk" → "Store"** (the CSS comment ~line 153 and the message-thread render). Fungie's bubble stays "Fungie".
   - GA fallback `BRAND.name || 'Runnr'` (~line 1303) → `'Check It For Me'`.
   - **Not copy (DevOps):** the dead Clerk auth SDK (`initClerk`, `handleClerkLinkCallback`, `clerk-captcha`, the Clerk bundle) and the internal `runnr_*` localStorage keys — leave those to DevOps; renaming storage keys needs a migration, and the Clerk SDK is being removed per `CLAUDE.md`.
2. **"check" is the unit — standardize it.** Replace customer-facing **"free call" / "free minutes" / "1 call"** with **"check."** Affected keys: `lead.title`, `lead.cta`, `earn.sub`, `earn.store.sub`, `sr.sub`, `rcpt.title`. (Internally it's a phone call — leave server/admin wording alone.)
3. **Footer brand** — fix "Fungibles powered by Fungibles" → "{Brand} powered by Fungibles" (Flag #1).
4. **"Navigating phone tree…"** → **"Working through the phone menu…"** (`demo.sys`) — "phone tree" is our internal word.
5. **Every reworded key needs its Spanish twin updated too** (the `es` map). E.g. if `lead.title` changes EN, change `'lead.title'` in the Spanish block to match ("Tu primera verificación es gratis").
6. **Leave the spine untouched:** the hero promise, `charge` ("No answer = no charge"), the trust strip, the verdicts, and the Live screen are the voice at its best. Don't let a refactor soften them.

---

*End of v1. Mark anything to change and I'll revise, then Check — Website implements. The Admin deck is its sibling: `COPY_DECK_ADMIN.md`.*
