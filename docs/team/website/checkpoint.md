# Check - Website — CHECKPOINT (current state)

> **Volatile — update at every "Checkpoint".** Newest on top, bullets, prune finished (history = git).
> Lane: the consumer web app `public/checkit.html` (+ `public/app.html` admin). STAGING-FIRST
> (`staging` → `staging.checkitforme.com`; promote = apply on the `main` prod branch). Clean split with
> the other dev: **he owns the tint CSS** (`__bootTone`/`tone-*`/body wash/sheet chrome), **I own
> view/mode/nav** — don't blind-edit the tint, it's fragile (see the hard lesson below).

## 🤝 HANDOFF (07-16) — state at session end
- Everything below is MERGED to staging, deploy-verified, and rode the fresh-start PROMOTE the PM ran
  (prod = staging as of 41901e5). Working tree clean; session branch merged via PRs #29/31/32/34/35/36.
- **⛔ Hard lesson — sheet-chrome tint:** I attempted the slide-up top/bottom transparency twice
  (grey wash, edge scrim), both made it worse, both REVERTED. Root cause found by the other dev:
  fixed-position scrims attached to a TRANSFORMED sheet pin to the sheet, not the viewport. He now
  owns the fix (his "attempt 4": strips take the sheet's own surface colour). Do NOT touch the
  overlay dim / root flip / scrims without him + a comp. Owner has NOT yet blessed attempt 4.
- **Owner actions pending:** (1) uncheck Store holds + Your voice in Admin → Plans (one plan is
  enough — the grid shows only services EVERY plan has; my API write was permission-blocked).
  (2) Eyeball on the phone: slide-up chrome (attempt 4), kiosk flow after a hard refresh
  (worked end-to-end on the live build when I drove it), alerts Mute/Stop, edit cell/email sheets.
- **`scripts/qa-website-drive.mjs`** (committed): drives all 13 verdict statuses + the alerts
  mute/stop flow headless against a local staging-mode server; asserts pill/date/headline/sub and
  the no-mid-sentence-wrap law in EN+ES. Run it before shipping verdict or alerts changes.

## ✅ Shipped this session (07-15 → 07-16, PRs #29/31/32/36 — all verified live)
1. **My checks:** edit cell = icon-top sheet, headline "Give us your new celly", every exit returns to
   My checks. Edit email = "Give us your new email address", blank box; empty save prompts, same
   address says "That's already your email". Earn row removed (Earn tab covers it).
2. **Alerts:** rows read "{product} at {store}" (server joins retailer + category names; junk labels
   fall back to the category, else store-only). MUTE pauses sends (muted column, /app/alerts/mute,
   fan-out skips; row dims) with pill "Muted. Unmute any time."; STOP removes + pill "Unsubscribed
   from restock alerts for {store}". Cache-first (My checks prefetches) → sheet opens instantly.
   Empty state "You haven't created any alerts." Sub "Manage your email and text alerts." (owner's
   words). Email unsubscribe link → /?alerts=1 (landing page gone; RFC 8058 POST kept). Buttons
   stack vertically so ES labels never squeeze copy into a wrap.
3. **Verdicts:** sub wrap law site-wide (`sentLines` — fits one line or breaks at the period, digits
   count as sentence starts). In-stock sub pulls the Admin statuses-registry note; `prodPhrase()`
   turns raw "Tin · Scarlet and Violet" into "a Scarlet and Violet tin" (EN+ES). Date/time on EVERY
   status (fixed the ts-less /pub/result branch + history-time fallback; all 13 statuses audited).
   Footer pins to the bottom edge on short verdicts (dead grey band gone; supersedes 07-10 item 51).
4. **Check+ = launch set, Admin-driven:** exact_products OUT of the catalog (every account gets exact
   asks; premiumAsks always true), hobby_hunts IN, store_holds/your_voice default OFF until built —
   checking them in Admin brings the box back, no code. Boxes 2-up BIG at ≤6 services, auto-tighten
   past 6. Tap a box → info sheet with book copy (docs/Check+, EN+ES, wrap-audited). Paid-welcome
   "Now live" list + "+N more" render from the same live list.
5. **Language:** every email-capturing POST sends the site lang; account stores it; alert emails/texts
   go out in the customer's language.

## ⏳ OPEN — needs owner / other lanes
- **Slide-up chrome (tint lane):** other dev's attempt 4 is on staging/prod — owner verdict pending.
- **Admin Plans:** owner unchecks Store holds + Your voice (see handoff bullet).
- **Email rendering** (Outlook/Gmail) — other lane actively iterating (one light design now).
- **Restock SMS blocked externally** (A2P denied, toll-free pending) — email alerts live.
- **Service worker PHASE 2** (network-first HTML + offline) — not rebuilt.
- **og:image URLs ride the internal railway host** — works; public-host constant cleaner (DevOps).

## 🪤 Traps
`known-problems` skill has the full list. New this session: #auth_logo is a left-flex wordmark bar —
stacked headers must override its container per mode · a fixed-position ::after on a TRANSFORMED
sheet pins to the sheet, not the viewport (the tint lesson) · bootstrap.ts ALTERs that run BEFORE the
CREATE TABLE silently no-op on fresh DBs — put the ALTER after the create · alerts sheet text column
is ~240px next to its buttons; sentences must fit it in BOTH languages · headless→staging TLS +
local-verify recipe = docs/shared/GOTCHAS.md + scripts/qa-website-drive.mjs.
