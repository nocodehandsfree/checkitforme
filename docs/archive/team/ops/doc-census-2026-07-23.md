# Doc census — 2026-07-23 (Ops)

Task: `docs/tasks/doc-census.md`. Every `.md` outside `docs/archive/` → keep / fix / archive.
158 files total. **Result: ~140 keep, 8 fix, 10 archive.** Owner approves before any move/edit.

The ~40 `docs/tasks/*.md` are the live queue (all open/blocked in INDEX) → **all KEEP**.
The rest of the KEEPs (manuals, guides, checkpoints, active specs, data/logo docs) are accurate.
Below are only the docs that need action.

## FIX (8) — accurate mostly, one stale section each
One theme drove half of these: the 07-22 rebuild **archived the consumer comp boards**
(`WEBSITE_COMPS`, `MY_ZONES_COMP`) and **retired the `?skin=v2` gate** (staging now sets
`data-skin='v2'` unconditionally). Docs still naming those retired systems as live were synced to
the rebuild truth already stated in `comps/README.md`.

**DONE (5) — synced to established rebuild truth (this commit):**
| Doc | Fix applied |
|---|---|
| docs/design/STYLE_GUIDE.md | consumer ref → live-site `truth/` snapshots; `?skin=v2` → the shipped default skin; retired-board list corrected (3 places) |
| docs/design/README.md | dropped archived WEBSITE_COMPS as active board; removed `?skin=v2` phrasing |
| docs/design/comps/README.md | removed the "Other boards" section resurrecting archived MY_ZONES_COMP |
| .claude/skills/build-on-brand/SKILL.md | site → `truth/` snapshots; drift note updated; noted COPY_STYLE_GUIDE_ADMIN now exists |
| docs/finance/CHEAP_NAV_ARCHITECTURE.md | `connectOnHuman` marked SHIPPED (live cheap path today) |

**REMAINING (3) — need their lane's context, not an Ops freestyle:**
| Doc | Why held | Route |
|---|---|---|
| docs/shared/API_CONTRACT.md | doc cites Clerk auth; server.ts uses our own phone-session JWT (`/app`) + `x-admin-token`/admin cookie (`/api`) — but 21 `src/` files still reference Clerk, so the true state is unclear | whoever owns auth (Ops/DD) — verify Clerk is retired before rewriting |
| docs/specs/README.md | index lists 3 of 18 spec folders; accurate rewrite needs each spec's live status | spec owners |
| docs/specs/alerts/build-spec.md | mostly shipped per 07-15 audit; only SMS caps remain | Webbie/alerts owner |

## ARCHIVE (10) — superseded / consumed / dated snapshots → move to docs/archive/
| Doc | Why |
|---|---|
| docs/team/data/handoffs/README.md | index of a consumed 07-10 handoff |
| docs/team/data/handoffs/brand-accuracy-2026-07-11.md | consumed dated pre-launch pass |
| docs/team/data/handoffs/chain-cleanup-2026-07-11.md | consumed one-time cleanup |
| docs/team/data/handoffs/mapping-gap-2026-07-11.md | gap list resolved by 07-16 |
| docs/team/mapping/report-2026-07-10.md | old dated sweep snapshot |
| docs/team/mapping/report-2026-07-11.md | old dated day-2 sweep snapshot |
| docs/team/mapping/unmapped-audit-2026-07-11.md | superseded by 99.9%-mapped state |
| docs/specs/support-agent/brief.md | seed intent superseded by spec.md + v3-messenger.md |
| docs/specs/independent-direct-nav/finding.md | explicitly built/done by DD 07-10 |
| docs/specs/ui-polish/shots/README.md | one-off 07-09 screenshot triage, task complete |

## KEEP — everything else (~140)
All manuals (`docs/shared/*`, role manuals), copy + brand guides, active specs
(launch-journeys, e2e-coverage, queue-feed, price-compare, admin-user-view, support-agent
spec/v3/panel, call-metrics, design-gap, logo-resolver, safari-tint, email-design-brief),
all data + logo docs, all current role checkpoints/handoffs, and the full `docs/tasks/` queue.

## Status (owner approved 2026-07-23)
- Archived the 10 → `docs/archive/` (git-tracked renames; recoverable).
- Fixed 5 of 8 stale docs (see table above). 3 held for their lane's context.
- `safari-tint` / `design-gap` / `call-metrics` briefs are old but have no shipped/superseded
  signal — kept as-is; flag if you want them archived too.
