# Check - Copy — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".**

## 2026-07-10 session, round 2 (owner feedback on the book)
- Book expanded to **46 pages / 8 categories** (v3): added Using Check (7), Check+ (10, one page
  per premium feature), Earn free checks (5), Help (6). It's the CS agent's knowledge base now,
  every fact pulled from live prod (referral reward = 3 checks live, not the 1 in policy docs;
  SMS caps 5/15/40/150; community auto-approve ON).
- Removed in-body "Next:" links (ReadMe renders its own at page bottom) + the admin screenshots
  (owner: wait for admin redesign).
- ReadMe template branding is dashboard-only (no API): theme kit ready at
  `docs/team/copy/readme-theme/` (custom.css + custom.js matching STYLE_GUIDE; the JS puts the
  full page list in the mobile slide-out). Owner needs to paste it in ReadMe → Appearance.
- Features documented as "rolling out": store holds, your voice, restock TEXTS (A2P pending).
  Driver handoff deliberately NOT in the book (demo stage).

## 2026-07-10 session (book overhaul + manuals + copy audit)
- Copper owns ALL words INCLUDING the book (owner re-confirmed; the separate "readme role" idea is dead).
- **Book rebuilt and live** on checkitforme.readme.io: 4 categories (Start Here · The Stores ·
  Under the Hood · Plans & Billing), 18 short pages, short titles (no mobile nav wrap), Next links
  on every page, real app screenshots + a composed logo wall image. Owner saw it, likes it.
- **Publishing changed**: branch `v1.0` has bi-directional GitHub sync with ReadMe. Edit the branch,
  push, done. NEVER create pages via API (makes duplicate slugs). Full how-to: `how-to-publish.md`.
- Plans pages verified against live `/pub/plans` (Family/Collector/Hunter/Operator + PAYG ladder).
- **Internal manuals shipped**: `docs/shared/ADMIN_MANUAL.md` + `WEBSITE_MANUAL.md` +
  `SYSTEM_MANUAL.md` (owner asked for EVERYTHING: backend, features, processes, the offer — the
  system manual covers call engine, lanes A/B/C/D, money, growth loops, data platform, ops, plus a
  quirks list incl. spend counter fed by nothing + MRR using the legacy $4.99 constant). Branch
  `claude/docs-overhaul-public-manuals-smlohx`, PR #6.
- **Copy gap analysis done** (EN+ES, site + admin, vs the hard rules). Numbered list sent to the
  owner for a vote. NOT fixed yet — waiting on approval. Biggest items: default toast pill is GREEN
  (31 call sites, rule says gray) · whole Zones feature has no Spanish (26 keys) · 6 rekeyed strings
  lost their ES · 5 hardcoded English strings · 4 em-dash strings · "unlocked" banned word.
- Bugs flagged to other lanes: Admin → Calls → Schedules tab is blank (no section/loader). Tooltip
  typo app.html:2919 "wrapping up.ping up."

## Open
- Owner vote on the copy gap list → then fix approved items (same branch, ES in same commit).
- Nice-to-have book image: a real verdict screenshot (needs an owner test-store call to capture).
