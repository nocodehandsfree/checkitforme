# Finding → DevOps/Website: harden the chain-logo resolver (drop the fuzzy name-guess)

**From:** DD · **Date:** 2026-07-10 · **Lane to action this:** DevOps/Website (owns `src/server.ts` logo resolver)

## The number (measured on staging, all active stores)
Replicated the live resolver over the full `retailers` dump (113,629 active stores):
- **100% are bound to a real chain** (`chainId` set). **Zero unlinked.** There is no store→chain
  mapping project to do — explicit binding is already the state of the data.
- Logo resolution today: **~105,800 resolve deterministically** (chain's saved `logoUrl`, or an exact
  chain-name slug file), **7,783 fall through to the generic category icon** (mostly intentional —
  the `Independent Card Shop` / `Comic Book Shop` buckets), and **0 currently depend on the fuzzy
  name-guess.** The earlier "~92k rides the name-guess" figure was estimated without DB access; it does
  not hold.

## The risk (dormant, not active)
`chainLogoFile()` in `src/server.ts` (~lines 801–806) has a **fuzzy fallback**: after the exact-slug
attempts, it scans every logo file and returns one whose stem (>3 chars) appears as a word in the chain
name. It fires for nobody today, but it is a footgun for any **future** chain whose name loosely
contains a logo filename — e.g. a chain called "Unique …" or "Pak N Save" could pick up an unrelated
brand's logo. This is the bug the owner flagged.

## Recommended change (small, safe, permanent)
Delete the fuzzy stem-in-name pass. Keep only: (1) DB `logoUrl` (already first), (2) the exact
chain-slug variants (hyphen/underscore/&→and). If a handful of chains ever genuinely need aliasing,
add a **curated** `alias → file` map rather than substring guessing. Impact on current data: **zero
stores change** (nothing rides the fuzzy path now); the change purely closes the future mis-match.

## How to verify after the change
Re-run the resolver over the `retailers` dump and confirm the deterministic count is unchanged
(~105,800) and the generic-icon count is unchanged (~7,783). DD can supply the check script.
