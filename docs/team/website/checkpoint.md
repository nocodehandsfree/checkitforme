# Check - Website — CHECKPOINT (current state)

> **Volatile — update at every "Checkpoint".** Newest on top, bullets, prune finished (history = git).
> Lane: the consumer web app `public/checkit.html` (+ `public/app.html` admin). STAGING-FIRST
> (`staging` → `staging.checkitforme.com`; promote = apply on the `main` prod branch). Clean split with
> the other dev: **he owns the tint CSS** (`__bootTone`/`tone-*`/body wash), **I own view/mode/nav** —
> don't blind-edit the tint, it's fragile.

## ✅ Shipped (07-16 early, batch 7 — owner's late-night list, PR #31)
1. **Check+ = launch set, Admin-driven**: exact_products OUT of the catalog (every account gets exact
   asks — hasFeature/premiumAsks ungated), hobby_hunts IN, store_holds/your_voice default OFF until
   built. Grid + paid-welcome list + "+N more" all render live from /pub/plans.everyPlanGets. Boxes go
   2-up BIG at ≤6 services, tighten to 4-up as Admin checks more on. Tap a box → bottom sheet explaining
   the service (copy condensed from the book docs/Check+, wrap-audited EN+ES headless).
   ⚠️ staging's STORED config still has store_holds/your_voice checked ON (permission classifier blocked
   me writing the Admin plans config) — owner unchecks 2 boxes in Admin → Plans and they vanish.
2. **Alerts sheet copy redo** (owner rejected "All for this account" + "cards at Fun"): sub "Every alert
   you've set up. Turn any off here."; rows = product at store (junk labels fall back to the category
   name) + one plain sentence for what the alert does. sentLines now also guards sheet copy; digits
   count as sentence starts.
3. **Verdict footer consistency**: body.rview main back to site-default flex — footer pins to the bottom
   edge on short verdicts; dead grey band under © is gone (supersedes 07-10 item 51 by owner 07-15 call).
4. **Alert language**: /app/email + watch subscribe + auto-check all send lang; server stores it on the
   account (alerts go out in the customer's language).

## ✅ Shipped (07-15 night, batch 6 — owner's 9-item list)
1. **Edit cell** returns to My checks after verify (AUTH_MODE='edit' → openAccount()), redesigned to the
   unified sheet header (phone icon on top, centered, NO wordmark — signup flow keeps the wordmark).
2. **Earn free checks row** removed from My checks overview (Earn tab covers it).
3. **Alerts sheet**: sub is ONE line ("Every ping you've turned on, in one place."), rows now say
   what+where ("Pokémon cards at Fun") + what the ping does in plain words. Server /app/alerts/me
   carries storeName (join in myAlerts). EN+ES same commit.
4. **Post your score**: unified icon-top centered header (camera, AC1).
5. **Verdict sub wrap law** (`sentLines`): multi-sentence subs fit one line or break ONLY at sentence
   boundaries (inline-block per sentence). "Rang and rang. | Nobody picked up. No charge." mid-sentence
   wrap is dead. Copy-guide has the general law; the explicit multi-sentence rule → flag Copper.
6. **In-stock sub pulls Admin**: killed the `note.hasdetail` override that printed raw productDetail
   ("Fun has set: Scarlet and Violet"). The Admin statuses-registry note ("{store} has {product} in.
   Go grab it.") is the source; `prodPhrase()` humanizes the raw "form · set" detail into "a Scarlet
   and Violet tin" (es: "tin de Scarlet and Violet"). Verified headless: exact owner-requested phrasing.
7. **Tint investigation (no code change — findings)**: result-page top staying dark in browser Safari is
   the owner-approved 07-09 "MIDDLE BLOOM" design (full top tint = standalone PWA only). The black top
   band on the owner's live-call screenshots is iOS's own in-call status chrome. Bottom grey bar =
   Safari tinting its bar from the sheet/page; not paintable from CSS. Header is position:static
   site-wide — live/result are just the only pages tall enough to scroll it away.

## ✅ Shipped earlier (07-13 → 07-15, batches 1–5 + verdict overhaul — all merged + deploy-verified)
Zones/checks sheet overhaul + 3C/4A header · share voice + 7 og unfurl cards + /s gate-skip · radius
½–10mi + Check+ map-reach + 25-store zone cap · unified icon-top sheet nav (yellow accent) + all
pop-ups → bottom sheets · Addie's alerts email UI (email edit sheet, alerts sheet, ?alerts=1) ·
verdict redesign (40px headline, micro date, "Calling ⟨logo⟩", calm one-color log, collapse+scroll-top,
live auto-follow, always-on call-again confirm). Detail = git log / PR bodies (#11-27).
Do NOT re-introduce: name-text basket chips, price/check-count in zone flow, green radius selection,
per-status color-flag call log (owner likes the calm one), 3-line subheads.

## ⏳ OPEN — needs owner / other lanes
- **Promote staging → prod** once owner signs off (staging carries many lanes' work).
- **❗Email template renders PLAIN TEXT in owner's inbox — UNRESOLVED** (Outlook mobile; check
  renderBrandedEmail on the test path, Brevo image hosting, brevoTemplateId).
- **Service worker PHASE 2** (network-first HTML + offline fallback) — not rebuilt.
- **Prod launch flags**: hobby=false, thrift=false on prod at launch.
- **Restock SMS blocked** (A2P denied, toll-free pending) — email alerts live; re-ask owner.
- **og:image URLs ride the internal railway host** — works, but a public-host constant is cleaner (DevOps).
- **Copper flag**: add the explicit wrap law to COPY_STYLE_GUIDE ("a multi-sentence line fits one line
  or breaks per sentence — never mid-sentence").

## 🪤 Traps
Moved to the **`known-problems`** skill (`.claude/skills/known-problems/`) — v2 toast defaults
green/wraps (pass `'neutral'`, use `.oneline`), `.loaddots` misses deep-link boot paint, direct-dial
chains need `avgTreeSeconds=null`, backgrounded `npx tsx` gets SIGTERM, Brevo env is `BREVO_API_KEY`,
`?skin=v2` gate is DEAD. Headless→staging TLS + local-verify recipe = `docs/shared/GOTCHAS.md`.
#auth_logo is a left-flex wordmark bar — stacked headers must override its container style per mode.
