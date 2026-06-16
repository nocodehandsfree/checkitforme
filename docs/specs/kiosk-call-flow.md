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
  - [x] **`kioskMode` defined** in `docs/API_CONTRACT.md` (optional bool on the 4 check endpoints).
  - [x] **Plumbed** (2026-06-16): the flag flows request → `triggerCall` / `bridgeStoreCall` →
    `provider.startCall`, and is exposed to the agent as the dynamic variable **`kiosk_mode`**
    (`"true"` / `""`). Kiosk-only stores (`hasKiosk && sellsPacks === false`) are **auto-detected**
    even when the request omits the flag; an explicit request flag wins. Covers both the plain and
    the bridged (listen-live) call paths.
- **Admin / Voice** — `src/voice/prompts.ts` (agent prompt/script):
  - [ ] Add the **kiosk call script**: branch on the **`{{kiosk_mode}}`** dynamic var (now live from
    DevOps — `"true"` when the store is kiosk-only) so the agent asks "is your Pokémon kiosk working
    and stocked?" instead of the shipment question. The var is already populated on every call — you
    only need to consume it in the prompt.
- **Website (consumer UI)** — `public/checkit.html`:
  - [ ] "Most likely": **star icon** (not the logo) + a "Most likely" label/tab.
  - [ ] **Fix the double-green-highlight**: picking another store clears the most-likely highlight.
  - [ ] Kiosk-only stores in the call list: show a **"Kiosk only"** badge + a pre-call note
    *"We'll ask if their kiosk is working"*; send `kioskMode` on the check request for those stores.

## The shared seam
The `kioskMode` flag is the contract between lanes: **DevOps** defines + plumbs it, **Website** sends
it for kiosk-only stores, **Voice** uses it in the prompt. Agree the field name in `API_CONTRACT.md`
first, then each lane builds independently.
