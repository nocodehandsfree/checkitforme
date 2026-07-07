# Check - Design — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## Current work

- **Design gap analysis — one style guide vs the live site.** Screenshotted every staging
  screen/state/theme, extracted comp + live tokens/copy, and cross-checked git for your
  sign-offs. Side-by-side pictures: `docs/specs/design-gap/inventory.html`. Drift list below —
  **vote each line: site wins (fold into the guide) or comp wins (fix the site).**
  `✅` = you already approved this divergence (fast-yes). `⚠️` = no sign-off on file, your call.

### The one that decides everything
- **Whole skin** · comp: the "elevated / soft-depth" look (page `#1D1D22`, raised gradient cards, no borders) · site: flat near-black (`#0C0C12`, `#1A1A24` sheets). The elevated skin is fully BUILT in the code as `data-skin="v2"` (368 rules) but staging ships it OFF. Most bullets below are really "v1 shipped vs v2 dormant." One yes here can settle most of them.

### Foundation / tokens
- **Page bg** · comp: `#1D1D22` · site: `#0C0C12`
- **Card / sheet** · comp: `#26262B` + raised row gradient `#2D2D34→#27272D` · site: flat `#1A1A24`, no depth
- **Muted text** · comp: `#8A8A96` · site: `#6B6B7B` (dimmer)
- **Primary CTA shape** · comp: 2.5px gradient RING around a dark capsule · site: SOLID green fill button
- **Finder CTA color** · comp: green/accent · site: PURPLE ("Find my stores" uses `--purple #A78BFA`) — guide §8 bans purple accents
- **Plan-tier selection** · comp: MUTED-YELLOW ring (§5.5 "no green ring next to a green CTA") · site: GREEN ring on the selected tier
- **Radii** · comp: big card/pop-up 26, sheet top 28 · site: cards/sheets mostly 16 — softer, less carved

### Components
- **Login** · comp: centered pop-up, no grabber, eyebrow "PHONE OR EMAIL", takes phone OR email (§5.11–12) · site: bottom-sheet card with a corner ×, phone-only (+1 flag)
- **Footer links** · comp: one line `Scores About FAQ Contact Legal` (Terms+Privacy = "Legal"), EN pill at row end (§5.14) · site: `Scores About FAQ Contact Terms Privacy` (split, no "Legal")
- **Footer layout** · comp: wordmark+© left / socials right · site: centered cluster, socials on their own row · ⚠️
- **Verdict title** · comp: 30px/900/−1px · site: 25px/900/−.6px
- **Store-row logos** · comp: chain PNG on `#1F1F25`, else embossed 2-letter tile — never blank · site: several rows render a broken-image placeholder
- **Plan-tier perks** · comp/approved: lead each tier with an icon (🔔/📅/🎯/🗺) ✅ · site: no perk icons yet (behind the approval)
- **Sheet corner ×** · approved: drop it, rely on grabber ✅ · site: buy/plans + login still show the ×
- **S2 mode-tab icons** · comp: active icon green `#4ADE80` (§5.1) · site: icons ride accent yellow · ⚠️
- **Calendar selected day** · comp: accent-yellow key (§5.10) · site: green `#4ADE80` · ⚠️

### Copy
- **"No charge" line** · guide: a green shield carries it — don't write the words · site: verdict notes write "No charge." literally (checkit.html:4640–4648)
- **Em-dashes** · guide: banned · site: still in `notify.ts` email subject/headline + toast "…any town." (checkit.html:3264)
- **Banned names** · guide: never CheckIt/Runnr · site: `notify.ts` still sends sender "CheckIt" + "Runnr" footer
- **Email templates** · one voice · site: two divergent systems in `alerts.ts` (plain vs branded) for the same events
- **Charge spine** · comp: "No answer = no charge. You always get the verdict." · site: "No answer = no charge." ✅
- **Brand fallback** · comp: "Fungibles" · site: "Check It For Me" ✅
- **Membership name** · comp: "Fungie+" · site: "Check+" ✅
- **Result foot** · comp: "Powered by {brand} · 1 check used" · site: "1 check used" only ✅

### Already approved elsewhere (fast-yes ✅ — flow, not pixels)
- Launch nav = Retail + Kiosk only (comp shows Retail·Thrift·Hobby·Kiosk); site labels them "Check a store · Kiosks"
- Hobby + Thrift hard-gated to paid; Retail lists general retail only
- "Post your score" picker offers only stores YOU found in stock (#12)
- Waitlist + add-store forms are email-only (never text)
- Zones: green check + green selection ring, cost line hidden

### Not captured (gaps to close next pass)
- Calls-by-day pop-over (`#calbtn` never became clickable on staging), full verdict page + "couldn't tell" poll, and the elevated comp frames as images (the comp `.dc.html` is a deck that won't self-render). Live tokens/copy for these are in the inventory, pulled from source.
