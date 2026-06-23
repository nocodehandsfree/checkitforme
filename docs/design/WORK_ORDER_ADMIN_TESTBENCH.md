# Work Order — Admin: Test Bench screen

> **For:** Check — Admin. **From:** Check — Copy.
> **This is a focused assignment.** Implement **one screen only** — the Test Bench. You do **not** need to read the full `COPY_DECK_ADMIN.md` for this. Everything you need is below. (Full deck is the reference if you want context: see its *Test bench* section.)
>
> **Why this screen first:** it's the most control-heavy page in the app — sliders, dropdowns, draft-vs-live state, a big "go live" action, nested cards. If the copy guide reads clean here, it'll read clean anywhere. We ship this one, eyeball it, then roll the rest.

---

## Scope

- **File:** `public/app.html`
- **Section:** `<section id="bench">` only. Don't touch other sections.
- **What to change:** the rows marked ✏️ (reword) and 🆕 (add) below, plus add the **tooltips** (`title="…"`), plus the **word removals** on this page. Anything not listed is already fine — leave it.

---

## 1. Screen header (add a sub)

The screen has its `h2` (`TEST BENCH`) but jumps straight into cards. Add a one-line sub under it so it has the Header → Sub → Body rhythm every screen should have:

> 🆕 **Sub:** `Tune the caller safely, hear it, then push it live to every store.`

Style it like other screen subs: `.meta`, ~13px muted, sitting right under the `h2`.

---

## 2. LIVE strip (`#live_strip`)

| Element | Now | New |
|---|---|---|
| Strip line | `📡 LIVE on store calls: {values}` | ✅ keep · add tooltip: `What every real store call is using right now` |
| Draft warning (`#ls_draft`) | `● Your draft differs from LIVE — store calls keep using the settings above until you apply.` | ✏️ `● Your draft is different from what's live. Real calls keep the live settings until you apply.` |

---

## 3. Voice & script (DRAFT) card (`#tb_voice_card`)

**Tooltips to add** (`title=` on the control or its label):

| Control | Tooltip |
|---|---|
| Opening line (`#tb_opening`) | `The caller's first words. {category} fills in Pokémon, One Piece, etc.` |
| Speed slider (`#sb_speed`) | `How fast the caller talks` |
| Warmth slider (`#sb_stability`) | `How much feeling is in the voice` |
| Naturalness slider (`#sb_latency`) | `Trade smoothness for speed` |
| The beat (`#sb_beat`) | `How long the caller waits before answering` |
| Voice model (`#sb_model`) | `The voice engine. Turbo sounds natural; Flash is faster but robotic.` |
| Brain / LLM (`#sb_llm`) | `Which AI runs the conversation` |
| Saved scripts (`#vt_preset`) | `Save a setup you like and load it back anytime` |

**Reword:**

| Element | Now | New |
|---|---|---|
| Warmth slider label gloss | `(left = warmer & more inflection; right = steadier/flatter)` | ✏️ `(left = warm and lively · right = steady and flat)` |
| Brain label | `Agent brain (LLM) — Sonnet 4.6 = best quality…` | ✏️ label `The caller's brain` · gloss `— smarter = better calls, cheaper = faster and less` |
| Apply note (under the apply button) | `The one global switch — copies this draft (voice + opener + brain) onto the live restock + carry agents. Until you press it, store calls don't change.` | ✏️ `The one big switch. Copies this draft — voice, opener, and brain — onto every real call. Nothing changes until you press it.` |
| Apply confirm dialog | `Go LIVE: apply this draft (voice + opener + brain) to ALL store calls?` | ✏️ `Go live? This makes the draft the voice for every real store call.` |

**Tooltips on the buttons:**
- `Apply to ALL store calls` → `Make this draft the live voice for every store call`
- `Save draft` → `Save the draft — real calls don't change`
- `Reload draft` → `Throw away edits, reload the saved draft`
- `Reset agent script to default` → `Put the caller back to the built-in, known-good script`

---

## 4. Rotation card (`#tb_rotate_card`)

| Element | Now | New |
|---|---|---|
| Body | `Live store calls round-robin through these. Leave empty to use the single live voice/opener.` | ✏️ `Real calls take turns through these. Leave it empty to use the one live voice and opener.` |
| Opener variants (label) | — | add tooltip: `One opener per line. Each call uses the next one.` |
| Voice pool (label) | — | add tooltip: `Tick the voices calls should rotate through` |
| Save rotation button | — | add tooltip: `Save — real calls start rotating` |

---

## 5. The test call card (`#tb_call_card`) — ⚠️ includes word removals

| Element | Now | New |
|---|---|---|
| Sub | `the agent calls YOU as the store` | ✏️ `the caller phones YOU — you play the store` |
| Body | `Pick the store context, then answer your phone like the clerk. Runs the draft voice with that store's real phone-tree rules. The result records against the store (visible in Results).` | ✏️ `Pick a store, then answer your phone like you work there. It runs your draft voice with that store's real menu rules, and saves the result against the store (you'll see it in Calls).` |
| Decision-tree label (`#sim_tree`) | `Decision tree (branches off verified)` | ✏️ `What counts as a yes` |
| — specific option | `Specific product — only greens if THAT is in` | ✏️ `Specific product — only a yes if THAT exact thing is in` |
| Your-phone label (`#sim_phone`) | `Your phone (the agent dials this)` | ✏️ `Your phone` |

**Tooltips to add:**
- Store dropdown (`#sim_store`) → `The result saves against this store`
- Category (`#sim_cat`) → `What to ask for`
- Decision tree (`#sim_tree`) → `How picky the caller is about what's "in"`
- Specific product (`#sim_specific`) → `The exact thing that has to be in stock`
- Your phone (`#sim_phone`) → `The caller dials this number — answer as if you work at the store`
- Voice (`#sim_voice`) → `Try any voice — your live store voice stays put`
- `📞 Call me` button → `Call my phone now and run the test`

---

## 6. Preview card (`#tb_preview_card`)

| Element | Now | New |
|---|---|---|
| Body | `Assembled live for the store + category picked above: global rules + the chain's phone tree + any store override.` | ✏️ `Built from your picks above: the global rules, the chain's menu steps, and any store-specific tweak.` |
| Refresh preview button | — | add tooltip: `Rebuild the preview from the current picks` |

---

## 7. Test result card (`#tb_transcript_card`)

| Element | Now | New |
|---|---|---|
| Timeout status | `Stopped polling (timed out). Check Results.` | ✏️ `Stopped waiting — check Calls for the result.` |

---

## 8. Word removals that fire from this screen

This screen's "Call me" runs `benchCall()` (~line 1488):

| Now | New |
|---|---|
| toast `Calling you — answer like the clerk!` | ✏️ `Calling you — answer like you work there!` |

(The bigger Clerk/Runnr sweep across the whole app is in the deck's *Word removals* section — but this one toast is triggered from this page, so do it here.)

---

## Spacing & spec check (before you call it done)

- Inputs/selects stay **16px** (don't shrink — stops iOS zoom).
- Card title → body keeps its breath (title `margin-bottom:6px`, body `margin-top:4px`). No title touching its helper line.
- Each card has **one** title. The sub/gloss is muted `.meta`, not a second bold title.
- Tooltips are `title="…"` on the control (or the label `<span>` if the control is a slider/range).
- Nothing wraps awkwardly at phone width — the longest new line here ("Pick a store, then answer your phone like you work there…") should sit as body `.meta`, not crammed into a label.

## Definition of done

- [ ] Every ✏️ and 🆕 above is in `#bench`.
- [ ] Every tooltip above is on its control.
- [ ] No "clerk" or "Runnr" left anywhere in `#bench` or `benchCall()`.
- [ ] Screen has Header → Sub → Body.
- [ ] Looks clean on a phone-width viewport.

When it's in, ping me (Check — Copy) and we'll eyeball it together. If it reads right, I'll cut work orders for the rest of the screens the same way.
