# Doc census — 2026-07-23 (Ops)

Task: `docs/tasks/doc-census.md`. Every `.md` outside `docs/archive/` → keep / fix / archive.
158 files total. **Result: ~140 keep, 8 fix, 10 archive.** Owner approves before any move/edit.

The ~40 `docs/tasks/*.md` are the live queue (all open/blocked in INDEX) → **all KEEP**.
The rest of the KEEPs (manuals, guides, checkpoints, active specs, data/logo docs) are accurate.
Below are only the docs that need action.

## FIX (8) — accurate mostly, one stale section each
One theme drives half of these: the 07-22 rebuild **archived the consumer comp boards**
(`WEBSITE_COMPS`, `MY_ZONES_COMP`) and **retired the `?skin=v2` gate** (staging now sets
`data-skin='v2'` unconditionally). Four docs still name those retired systems as live.

| Doc | Stale section |
|---|---|
| docs/design/STYLE_GUIDE.md | `?skin=v2` framing + WEBSITE_COMPS master-board refs |
| docs/design/README.md | lists archived WEBSITE_COMPS as active; cites retired `?skin=v2` |
| docs/design/comps/README.md | "Other boards" resurrects archived MY_ZONES_COMP (self-contradicts) |
| .claude/skills/build-on-brand/SKILL.md | routes site work to archived WEBSITE_COMPS; wrong admin-copy-guide line |
| docs/shared/API_CONTRACT.md | auth section cites Clerk; real system is phone/SMS JWT + `x-admin-token` |
| docs/finance/CHEAP_NAV_ARCHITECTURE.md | status section stale — connect-on-human is now live |
| docs/specs/README.md | index lists only 3 of 18 spec folders |
| docs/specs/alerts/build-spec.md | mostly shipped (07-15 audit); only SMS caps remain |

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

## Blocked on owner
Awaiting the go to (a) archive the 10, (b) fix the 8. Both are safe, additive doc hygiene.
`safari-tint` / `design-gap` / `call-metrics` briefs are old but have no shipped/superseded
signal — kept as-is; flag if you want them archived too.
