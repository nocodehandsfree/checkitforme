# E2E Path Harness — launch coverage (design spec)
**What this is · who it's for:** the full ranked list of user paths to test before launch, each with its
expected end state. Opus designed it (the "what and why"); the executing lane fills selectors from the
live staging DOM and writes the `test(...)` in `tests/e2e/consumer.spec.ts` / `admin.spec.ts`, top of the
list first. Rule (from tests/e2e/README): ONE assertion per path, independent + idempotent, staging only.

Legend: **P0** = money/core, a break loses a paying customer · **P1** = retention + viral (revenue drivers)
· **P2** = secondary consumer · **P3** = admin. Gated paths need a comp/entitled test account or a flag ON.

---

## P0 — money & core (8) — MUST be green before launch
| # | Path | Steps | Expected end state |
|---|---|---|---|
| 1 | Signup (phone-first) | enter number → verify | account exists, lands logged-in, free-check balance = `pricing.freeChecks` |
| 2 | Find a store near me | allow location OR type area → pick radius | store list + map render, at least one callable store |
| 3 | Check a store → verdict | pick store → press Check → wait | result screen resolves to ONE of in / out / soon / unclear (drive Fun store from Admin→Testing) |
| 4 | Proof page | open a finished result | shows verdict + product + transcript (the proof) |
| 5 | Plan sheet renders | open upgrade / plans | 4 tiers + PAYG render with correct prices from `/pub/plans` |
| 6 | Subscription checkout | pick a tier → checkout (4242 card) → return | account shows tier + `quotaCredits` reflects tier quota |
| 7 | PAYG checkout | pick a bundle → checkout (4242) → return | `credits` increases by bundle size |
| 8 | Free check → paid check gate | spend free check → try another | prompted to upgrade/buy; balance never goes negative |

## P1 — retention & viral (8)
| # | Path | Steps | Expected end state |
|---|---|---|---|
| 9 | Restock alert / watch | on a sold-out verdict → "tell me when it's back" | watch created, confirmation shown |
| 10 | Referral | open Earn → copy link → claim as 2nd user | both accounts get `rewards.referralChecks` |
| 11 | Share a find | on an in-stock verdict → share | share card / OG image generates, link present |
| 12 | Finds feed | load home | "Scores from the hunt" strip renders recent confirmed finds |
| 13 | Sightings banner | load home in a served area | rotating "spotted near you" banner renders (no call) |
| 14 | Any-town gate | free user searches outside 20mi | upsell toast: "Check any town is a Check+ feature" (no call fires) |
| 15 | Scheduled checks | comp acct → create an auto-check → list → delete | schedule appears in "Your auto-checks", deletes clean |
| 16 | Zone sweeps | comp acct → build a zone → quote → run → stop | zone saves, quote shows cost, run starts + stops |

## P2 — secondary consumer (12)
| # | Path | Steps | Expected end state |
|---|---|---|---|
| 17 | Kiosk picker + report | Kiosk tab → pick kiosk → report refresh time | report saved, free-check reward granted |
| 18 | Kiosk receipt | submit a kiosk receipt | receipt accepted → free check granted |
| 19 | Best bet | search a product | up to 3 ranked "best bet" stores shown |
| 20 | Product / set picker | open "anything specific?" → pick set/product | selection pins to the check |
| 21 | Sell-methods card | pick a non-callable chain (Amazon/Micro Center) | shows online/ways-to-get + resale warning, no call button |
| 22 | Spanish / i18n | switch to Spanish | UI strings flip, layout not broken |
| 23 | Feedback on verdict | on a result → "what was it really" | feedback recorded, thank-you shown |
| 24 | Store request / waitlist | "don't see your store" → submit | request saved; unserved area → waitlist capture |
| 25 | Hobby tab | Pokémon comp acct with `exact_products` | Hobby chip appears + loads; hidden for non-entitled |
| 26 | Thrift tab | comp acct with `thrift_hunts` | Thrift chip appears + loads; hidden for non-entitled |
| 27 | Live listen hidden | free user, `liveListen` OFF | no live-listen control shown (it's a testing tool) |
| 28 | Anti-abuse throttle | check same store+product twice within the hour | 2nd blocked with "too soon" (429), no double charge |

## P3 — admin (12)
| # | Path | Steps | Expected end state |
|---|---|---|---|
| 29 | Token login → shell | /admin-login?token= | admin shell loads |
| 30 | Calls feed | open Calls | recent calls list renders |
| 31 | Stores list / search / add | open Stores → search → add | list renders, search filters, add saves |
| 32 | Chains / Mapping | open Mapping → Map + Confirm-stock | recipe/tree view renders, confirm-stock works |
| 33 | Statuses editor | open Statuses | status registry renders + edits save |
| 34 | Plans edit + publish | Plans tab → change a price → publish | Stripe sync status flips to in_sync |
| 35 | Policy flags | Policy tab → toggle a flag | flag persists (this is where Retail/Kiosk-only + thrift/hobby live) |
| 36 | Schedules | open Schedules | customer schedules list renders |
| 37 | Feedback review | open Feedback | user feedback rows render |
| 38 | GTM checklist | open GTM | checklist renders, item status toggles |
| 39 | Designer / voice | open Designer | voice presets + design controls render |
| 40 | Testing / Fun store | Testing → place a Fun-store call | test call runs, never touches real-store stats |

---

## Execution notes (for the running lane)
- Target staging only (`E2E_BASE_URL=https://staging.checkitforme.com`). Never point write paths at prod.
- Real calls → drive the owner-only **Fun** store (Admin → Testing). Never call real stores in a test.
- Admin specs need `ADMIN_TOKEN` from Railway. Entitled paths (15,16,25,26) need a comp test account.
- Card: `4242 4242 4242 4242` works on STAGING only.
- Fill selectors from `pnpm e2e:ui` (watch it click, copy suggested selectors). One assertion per path.
- The **real-money prod money-path** (signup → call → upgrade with a real card) is OWNER-MANUAL —
  Playwright never does it. That test lives with the owner, not in this suite.
- Wrap P0 in Checkly (prod monitoring, same code) after launch so a broken checkout pages someone.
