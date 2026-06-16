# Feature spec: kiosk-only stores in the call flow + "most likely" fix

Cross-lane feature — the shared reference so Website, Admin/Voice, and DevOps build their parts in
parallel without crossing. **They touch different files** (see lane breakdown).

## Problems to fix
1. **"Most likely" suggested Pavilions** — which is **kiosk-only** (no shelf stock) → wrong to ask
   "did you get a Pokémon shipment today?". ✅ fixed in backend (best-bet now excludes kiosk-only).
2. **Two stores green-highlighted at once** — the "most likely" stays highlighted after you pick a
   different store. Selecting another store should clear the most-likely highlight.
3. **"Most likely" isn't obvious** — it's just highlighted. Needs a clear marker (a **star icon**
   instead of the logo, and/or a "Most likely" label/tab) so users know what it is.
4. **Kiosk-only stores should still be callable** — but with a DIFFERENT script: *"we'll ask if your
   kiosk machine is working / stocked,"* not "did a shipment arrive."

## Data model (how stores are flagged — Data Dev owns the rows)
- `retailers.sellsPacks` = true → sells on the **shelf** (normal shelf-stock check).
- `retailers.hasKiosk` = true → has a vending **kiosk**. **Kiosk-only** = `hasKiosk:true, sellsPacks:false`.
- Kiosk stores appear in BOTH the kiosk section AND the call-a-store list.

## Lane breakdown (do NOT cross — each edits its own files)
- **DevOps (backend)** — `src/best-bet.ts` / `/pub/best-bet`, `src/calls/`:
  - ✅ best-bet excludes kiosk-only from "most likely" (shelf rec).
  - [ ] Add a **`kioskMode` flag** to the call path: when a kiosk-only store is called, pass a var to
    the agent so the prompt asks about the **kiosk** (working/stocked), not a shelf shipment. Define
    it in `docs/API_CONTRACT.md`.
- **Admin / Voice** — `src/voice/prompts.ts` (agent prompt/script):
  - [ ] Add the **kiosk call script**: when `kioskMode` is set, the agent asks "is your Pokémon kiosk
    working and stocked?" instead of the shipment question.
- **Website (consumer UI)** — `public/checkit.html`:
  - [ ] "Most likely": **star icon** (not the logo) + a "Most likely" label/tab.
  - [ ] **Fix the double-green-highlight**: picking another store clears the most-likely highlight.
  - [ ] Kiosk-only stores in the call list: show a **"Kiosk only"** badge + a pre-call note
    *"We'll ask if their kiosk is working"*; send `kioskMode` on the check request for those stores.

## The shared seam
The `kioskMode` flag is the contract between lanes: **DevOps** defines + plumbs it, **Website** sends
it for kiosk-only stores, **Voice** uses it in the prompt. Agree the field name in `API_CONTRACT.md`
first, then each lane builds independently.
