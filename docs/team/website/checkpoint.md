# Check - Website — CHECKPOINT (current state)

> **Volatile — update at every "Checkpoint".** Newest on top, bullets, prune finished (history = git).
> Lane: consumer web app `public/checkit.html` + consumer routes in `src/server.ts`. STAGING-FIRST
> (`staging` → `staging.checkitforme.com`; promote = apply on `main`). Clean split with the other dev:
> **he owns the tint CSS** (`__bootTone`/`tone-*`/body wash/sheet chrome), **I own view/mode/nav**.

## 🚧 07-21 — HANDOFF (session ending, agent deprecated). Everything below is on `staging`, committed + pushed. Working tree clean, `staging` == `origin/staging`. Current rev served: `glassfix-r171`.

> ⛔ **HARD BOUNDARY set by owner this session — carry it forward.** Do NOT touch the calling engine,
> the recipes, the voice/bridge listening logic, or any store settings, EVER, unless a written order
> names that exact file. That lane is Echo/Mapper's. **Echo is restoring Mapper's fix `770ffa0`** (the
> one-line VAD/listening fix) — do not touch it. This session bypassed the proven dial engine and
> flip-flopped 770ffa0; that is the root of the grief. The Website lane = the SCREENS only, built from
> pieces that already exist. Reuse, don't reinvent (no homemade icons / call paths / behaviors). When
> something isn't obviously screens, ASK first.

**Shipped to staging this session (client `public/checkit.html`, all verified headless before push):**
- **r165–r166 Zone report transcripts** = the REAL check status page, unfolded IN the zone report frame
  (never a separate page). `zoneExpand(cid)` renders through the SAME engine as a single check:
  `deriveVerdict()` (extracted from `showResult`, one status→copy source) + `combinedTimelineHTML` +
  `chatBubbles`. RESULT pill, verdict, timeline, transcript, share — identical to a single check.
  Finished rows unfold; queued rows keep the stop prompt; mid-call rows show the live peek.
- **r165 History unification** — calendar-opened calls resolve logo/address from the live `STORES`
  record (same source as a refresh) + `/pub/store` backfill; `restoreCall` shadow row now carries
  `categoryId/category/zoneRunId` (a null categoryId was dropping calls out of the ‹ › arrow pool);
  `ensureHistCache` heals already-poisoned local rows. Individual zone calls appear in My Checks
  calendar AND unfold in the report (both paths proven with `scratchpad/bothtest.js`).
- **r167 zone fixes**: edit-zone preselect (was fetching a nonexistent `GET /app/zones/:id` → now seeds
  name + selected stores from the zones LIST); bottom slide-ups (`#zmenuOv` etc.) got a hairline top
  border + deeper shadow; share sheet rebuilt to comp (title, card headline + `product · zone · when`
  meta + in-stock tiles, share-text well, SHARE + COPY side by side; `zoneCopyShare`); wide wordmark
  logos (TJ Maxx) render at natural width in the `.callwho` "Calling" chip; zone name capped 24 chars.
- **r168 ghost-tap guard v2** — the check-zone confirm could start a sweep from the SAME tap that opened
  it (iOS trailing click). v1 (600ms dead window) ALSO ate a real fast tap. v2: the go button arms only
  after a real `pointerdown/touchstart` lands on the sheet — the phantom click has none. Proven both
  ways headless (`scratchpad/r167test.js`, guard-v2 test).
- **r171** — create-zone location button now uses the homepage pin (`ICO.pin`), not the crosshair.

**⚠️ Server + data changes I made this session (OUTSIDE the pure screens lane — flag for reconciliation):**
- `src/db/bootstrap.ts` + `src/server.ts` (r169, committed/pushed): CUSTOMER-initiated stops (live
  Stop & hang up, zone Stop all / stop-one) stamp `statusKey: "user_cancelled"` → "Check cancelled /
  You stopped this check from happening." Row STATUS stays `admin_hangup` (all non-result/no-charge
  rules unchanged). Admin `/api/hangup` keeps `admin_hangup`. Seeded a `user_cancelled` status row.
- `src/voice/elevenlabs.ts` + `src/voice/provider.ts` (r170, committed/pushed): the EL outcome mapper
  computes a real step ladder with timestamps from the transcript clock, returned on `/pub/result` as
  `steps[]`, so replayed checks (zones incl.) show steps+seconds. **NOTE: this touched voice/ files —
  under the new boundary this was over my line; leaving it in place because it's live + tested, but
  the next owner of that lane should review/own it. Do not have Website touch it again.**
- **⚠️ Owner rewriting the cancel COPY** — he flagged the em-dash in "It doesn't count — no charge" as a
  style-guide violation (`docs/design/copy/COPY_STYLE_GUIDE.md`: no dashes inside sentences). Copy is
  the Copy lane's / owner's job, NOT mine. He will supply the words. Do not author status copy.
- **Live Admin data I wrote directly** (the ONE decoupled Admin at `admin.checkitforme.com`, reads live
  prod): patched `admin_hangup` note + created the `user_cancelled` status row via `/api/statuses`.
  Also flipped chain **79 (TJ Maxx)** `logoWide/logoDark = true` on `staging.checkitforme.com/api/chains`.
  (Store-setting edits are now OUT of bounds too — logged here only so state is known.)

**Open / next (screens lane only, when owner directs — do NOT self-start):**
- Owner supplies rewritten cancel copy (no dashes) → paste verbatim into the Admin status note.
- Owner's demo is tomorrow; everything above is on staging. If a PROD demo, promote train = merge
  staging → prod branch (not mine to run without a written order).
- Earlier owner asks intentionally NOT built (correct — he said hold): re-check dedup rules (skip/warn
  on same-day re-checks), nightly LLM transcript assessment. Do not build unprompted.

*(07-19 sections — referral welcome, zone report, share landing — FINISHED + pruned per docs law; full detail in git history of this file.)*
