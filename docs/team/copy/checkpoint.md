# Check - Copy — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".**

## 2026-07-10 session (book overhaul + manuals + copy audit)
- Copper owns ALL words INCLUDING the book (owner re-confirmed; the separate "readme role" idea is dead).
- **Book rebuilt and live** on checkitforme.readme.io: 4 categories (Start Here · The Stores ·
  Under the Hood · Plans & Billing), 18 short pages, short titles (no mobile nav wrap), Next links
  on every page, real app screenshots + a composed logo wall image. Owner saw it, likes it.
- **Publishing changed**: branch `v1.0` has bi-directional GitHub sync with ReadMe. Edit the branch,
  push, done. NEVER create pages via API (makes duplicate slugs). Full how-to: `how-to-publish.md`.
- Plans pages verified against live `/pub/plans` (Family/Collector/Hunter/Operator + PAYG ladder).
- **Internal manuals shipped**: `docs/shared/ADMIN_MANUAL.md` + `docs/shared/WEBSITE_MANUAL.md`
  (every tab, every feature, line refs). Branch `claude/docs-overhaul-public-manuals-smlohx`, PR #6.
- **Copy gap analysis done** (EN+ES, site + admin, vs the hard rules). Numbered list sent to the
  owner for a vote. NOT fixed yet — waiting on approval. Biggest items: default toast pill is GREEN
  (31 call sites, rule says gray) · whole Zones feature has no Spanish (26 keys) · 6 rekeyed strings
  lost their ES · 5 hardcoded English strings · 4 em-dash strings · "unlocked" banned word.
- Bugs flagged to other lanes: Admin → Calls → Schedules tab is blank (no section/loader). Tooltip
  typo app.html:2919 "wrapping up.ping up."

## Open
- Owner vote on the copy gap list → then fix approved items (same branch, ES in same commit).
- Nice-to-have book image: a real verdict screenshot (needs an owner test-store call to capture).
