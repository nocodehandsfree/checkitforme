# Check - Design — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

## Current work

- **Design gap analysis — one style guide vs the live site.** Compared the comp
  (`STYLE_GUIDE.md` / `NEW_CHECK_COMPS.dc.html`) against `staging.checkitforme.com`.
  Side-by-side pictures: `docs/specs/design-gap/inventory.html`. Vote each line below —
  **site wins (fold into the guide) or comp wins (fix the site).** `✅` = already approved.

### Read this first — skin + comp status (resolved)
- **"v3" = a cache bump, not a new skin.** The elevated skin is still `?skin=v2`. The recent
  service-worker/cache-version bump (the "stuck stale design on my laptop / Cloudflare" fix) is what
  let you finally load it — so what you see now = the v2 elevated skin. There is no v3 in any branch.
- **v2 ≈ the comp.** The elevated look matches the guide. My first pass mistakenly shot the *default*
  render (still the old flat **v1** — gated off until you approve the takeover), so flat page / purple
  button / "Check a store" / green plan ring / corner × were all v1 artifacts, gone in v2. **The real
  action is: promote v2 to default so normal visitors stop getting v1.**
- **One comp now.** `NEW_CHECK_COMPS.dc.html` is the single visual comp; the duplicate bundle
  `NEW_CHECK_COMPS.html` is retired to `docs/archive/`. The guide, the comp, and the copy guide now
  reference each other (see `STYLE_GUIDE.md` header + `comps/README.md`).

### Reconciled INTO the guide (shipped decisions — no vote needed)
- **Mode-tab icons** now ride the brand accent, not green (commit 5bcb734) → §5.1 updated.
- **Calendar selected day** = Check-green, not accent-yellow (commit 977cbc7) → §5.10 updated.
- **Footer** = one centered, unified cluster (commit 9a39fd4) → §5.14 updated.

### Decided by owner → guide updated
- **Footer = single "Legal" link** covering Terms + Privacy (§5.14). **Site to-do:** live footer still
  lists them separately — collapse to one `Legal` link.
- **Login = phone number only**, no email (§5.12 updated; phone IS the login).

### Open — site bug (not a design vote)
- **Store-row logos** · never blank (chain PNG or embossed initials) · v2: some rows show a broken-image placeholder — should fall back to the initials tile.

### Copy (skin-independent — for the copy lane)
- **"No charge" wording** · guide: a green shield carries it — don’t write the words · site: verdict notes write "No charge." literally (checkit.html:4640–4648)
- **Em-dashes** · guide: banned · site: still in `notify.ts` email subject/headline + toast "…any town." (3264)
- **Banned names** · guide: never CheckIt/Runnr · site: `notify.ts` still sends sender "CheckIt" + "Runnr" footer
- **Email templates** · one voice · site: two divergent systems in `alerts.ts` (plain vs branded) for the same events

### Already approved — confirmed present in v2 (fast-yes ✅)
- Elevated skin, raised cards, green ring CTAs · Launch nav = Retail + Kiosk · Plan perk-icons +
  yellow tier ring · Sheet grabber, no corner × · "No answer = no charge." · Check It For Me /
  Check+ (not Fungibles/Fungie+) · "1 check used" (no "Powered by").

### Not re-shot in v2 (gaps to close next pass)
- Full verdict page + "couldn’t tell" poll (simulated call didn’t resolve in the window), and the
  calls-by-day pop-over (`#calbtn` wouldn’t click). Recapture with `?skin=v2`.
