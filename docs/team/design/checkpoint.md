# Check - Design — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## Current work

- **Design gap analysis — one style guide vs the live site.** Compared the comp
  (`STYLE_GUIDE.md` / `NEW_CHECK_COMPS.dc.html`) against `staging.checkitforme.com`.
  Side-by-side pictures: `docs/specs/design-gap/inventory.html`. Vote each line below —
  **site wins (fold into the guide) or comp wins (fix the site).** `✅` = already approved.

### Read this first — the skin gate
- Staging serves **two skins**. The new **elevated skin (`?skin=v2`)** is what YOU see — it’s
  gated per-device with `?skin=v2` and stays "off by default" for normal visitors *until you
  approve the takeover* (that’s baked into the code as a comment). A plain visitor still gets the
  **old flat v1** default. My first pass shot the default and reported v1 — wrong baseline. This
  list is now **comp vs the v2 skin you actually use.**
- **Verdict: v2 ≈ the comp.** The elevated look matches the guide — page `#1D1D22`, raised
  cards, green **ring** CTAs, Retail·Kiosk labels, plans with perk-icons + **yellow** tier ring,
  sheets with a grabber and no corner ×. The big "drifts" from my first pass (flat page, purple
  button, solid CTA, "Check a store" labels, green plan ring, missing perk icons, corner ×) were
  **all v1 artifacts** — gone in v2. **The real action isn’t a redesign — it’s: promote v2 to the
  default so normal visitors stop getting v1.**

### Genuine comp-vs-v2 nits (small — vote per line)
- **Footer links** · comp: one line ending `…Contact Legal` (Terms+Privacy collapsed to "Legal", §5.14) · v2: still shows `…Contact Terms Privacy` (split)
- **Mode-tab icon color** · comp: active icon green `#4ADE80` (§5.1) · v2: active Retail/Kiosk icon rides accent yellow · ⚠️
- **Login contact field** · comp: eyebrow "PHONE OR EMAIL", accepts phone OR email (§5.12) · v2: phone-only (+1 flag), keeps a corner × (× removal was scoped to account/buy/page sheets, not login)
- **Store-row logos** · comp: chain PNG on `#1F1F25`, else embossed 2-letter tile — never blank · v2: some rows render a broken-image placeholder (should fall back to initials)

### Copy (skin-independent — these stand regardless of v1/v2)
- **"No charge" wording** · guide: a green shield carries it — don’t write the words · site: verdict notes write "No charge." literally (checkit.html:4640–4648)
- **Em-dashes** · guide: banned · site: still in `notify.ts` email subject/headline + toast "…any town." (3264)
- **Banned names** · guide: never CheckIt/Runnr · site: `notify.ts` still sends sender "CheckIt" + "Runnr" footer
- **Email templates** · one voice · site: two divergent systems in `alerts.ts` (plain vs branded) for the same events

### Already approved — confirmed present in v2 (fast-yes ✅)
- Elevated skin, raised cards, green ring CTAs · Launch nav = Retail + Kiosk · Plan perk-icons +
  yellow tier ring · Sheet grabber, no corner × · "No answer = no charge." · Check It For Me /
  Check+ (not Fungibles/Fungie+) · "1 check used" (no "Powered by").

### Not re-verified in v2 (gaps)
- Calendar selected-day color, full verdict page + "couldn’t tell" poll, calls-by-day pop-over
  (`#calbtn` wouldn’t click). Recapture with `?skin=v2` next pass.
