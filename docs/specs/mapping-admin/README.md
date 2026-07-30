# The mapping screen, and the day we start calling stores

**Written 2026-07-28 as a handoff. The owner's words: "read everything and don't do a half assed
job." That is not a mood, it is the lesson of the session that produced this file.**

---

## 0. Before you touch anything

Read these IN FULL. Not grep, not the first fifty lines. The last agent read only the section with
its own name on it, told the owner the whole spec was built, and was wrong — the single most
important requirement in the document had never been built, and the "fix" for it broke a different
rule in the same document.

| Read | Why |
|---|---|
| `docs/specs/live-call-runtime/README.md` | ALL of it. §1, §2 and §10 are the ones people skip. |
| `docs/design/comps/ADMIN_COMPS.dc.html` §2f + §2g | **RENDER IT AND LOOK.** Instructions below. |
| `docs/design/copy/COPY_STYLE_GUIDE_ADMIN.md` | The words. Staff, never "a person". |
| `docs/design/STYLE_GUIDE.md` | The look. Every token you are allowed to use. |
| `docs/team/voice-calls/checkpoint.md` | What is live, what failed, what is a trap. |
| `src/calls/mapgraph.ts` · `navigator.ts` · `listen-nav.ts` | The map, the caller, the Ear. |

Then run, and read the output, before you believe anything:

```
env DATABASE_URL=file:./.t.db ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test \
  ELEVENLABS_PHONE_NUMBER_ID=test ./node_modules/.bin/tsx scripts/test-spec-sweep.ts
```

85 statements pass, 0 fail, 9 need a phone. **If that number drops, you broke something.**

---

## 1. What the objective actually is tomorrow

**Get through the phone menu to a real person, at every chain we dial, as fast as the store allows,
and write down exactly how — with proof.**

Not "make calls." Not "fill the map." Every mapping call has to leave behind:

1. **The path that worked** — the words or keys, and which store recording each one follows.
2. **Proof a person answered** — their own words. A transfer announcement is not a person. Hold
   music is not a person. Silence is not a person. This has been got wrong twice; see §3.
3. **The menu the store read out** — every department it offered, spoken or pressed. The owner's
   first instruction on this project and the thing that was missed.
4. **When it happened** — the store's local hour and the day of week. Menus differ at 9pm.

Then hang up. A mapping call never asks about stock and never troubles Staff.

**The owner works alongside these calls.** Do not start a sweep on your own judgement. One call, look
at it together, then more.

### The three numbers that mean we are doing the job

- **time to a person** going down for a chain, and the screen showing it went down.
- **unknowns** going down — fewer menus we cannot explain.
- **paid agent seconds** going down, because a route that lands on the human at the right second
  means the expensive agent is not billing through a recording.

---

## 2. The one thing left to build: the page

The data is done. The design is done. The screen is not.

**Comp `2g Mapping calls · the sheet`** is in `ADMIN_COMPS.dc.html`. Render it and look at it before
you write a line:

```
./node_modules/.bin/tsx scripts/render-comps.ts board
# then OPEN loops/site-redesign/render/board-05.png
```

**The data it renders** is already served by `GET /api/admin/map/chain/:id`:

- `calls[]` — every mapping call, newest first. Each has `store`, `at`, `reachedHuman`, `seconds`,
  `transferAtSec`, `greeting`, `stopReason`, and `turns[]`.
- `turns[]` — the conversation. `who` is `"them"` (the store) or `"us"`, plus `atSec`, `text`,
  `action`, `value`.
- `versions[]` — each carries `label` ("Chain v2" / "This store v1"), `status`, `recipe`, `evidence`.

**And `GET /api/admin/map/graph` gives the chain row**, including the improvement the owner asked for:
`firstSeconds`, `bestSeconds`, `savedSeconds`, `calls`, `stores`, `menuOptions`. All null-safe; null
means we have not earned the right to claim a trend yet, so render nothing rather than a zero.

### Build it in `public/app.html`

**NEVER open that file whole — it breaks agents.** Read `docs/design/INDEX.md` for the section index,
then read ONLY the line range you need.

What "correct" means here, in the owner's words: he can open a chain, read one call top to bottom and
follow what we did, and see the recipe it produced. Nothing else on the screen.

- One call per card, newest first. **Two cards, then a Show-more key.** The sheet is for reading one
  call, not scrolling all of them.
- The store's lines small and gray; ours bold with a green dot. That contrast IS the feature.
- Every card ends in one line: **PRODUCED — "Chain v2 · 5s faster"** or **"Nothing changed."** It is
  the only thing tying a conversation to a recipe.
- A call that failed ends amber, not green.

---

## 3. Traps that were paid for in real calls. Do not rediscover them.

- **There is ONE Ear.** `PromptDetector` + `ConversationEar` in `src/calls/listen-nav.ts`, fed from
  the `/twilio-media` fork. A second listener was built here on 07-28 and deleted the same night
  because §10 forbids it in plain words. `scripts/spec-gates.sh` now fails the push if you try again.
- **The Ear is a veto, never a green light.** It can say "that is hold music, not a person." It
  cannot say "that is a person," because the ring-frequency test still lives in the machine-locked
  bridge and without it a ringing desk looks like a voice with gaps.
- **A person has to be heard.** Twilio's speech gather returns an empty string for silence, for hold
  music and for a ringing desk alike. On 07-28 that put 84s into the map as time-to-human with not
  one word of proof — and time-to-human is the number the paid agent opens on.
- **A store that already played a recording does not answer direct.** A transcriber turned
  "…are you a healthcare provider?" into the three words "A healthcare provider." and a whole store
  was filed as answering with no menu.
- **The greeting must be what was said on THIS turn.** Otherwise the machine's own "transferring you
  now" gets filed as the desk that picked up.
- **Anchors come off the Ear's recording count** (`earPrompts`), never off counting transcript lines.
  One recording often arrives as two lines.
- **`src/voice/**` is machine-locked.** Owner names the task, you write the glob into a repo-root
  `.unlock`, fix only that, delete it. **Today the sprawl gate blocks creating `.unlock` at all** —
  `.claude/allowed-paths` needs it before that flow works.
- **Open bug the owner is handling:** if `bail` is switched off in Admin, the bridge falls back to
  opening the paid agent on a stopwatch, whatever is playing. That is the Barnes & Noble failure.

---

## 4. How you report

`docs/team/voice-calls/handoff.md` is the charter and it still applies. On this work specifically:

- **Never say "built to spec" about a document you only read your half of.** Say which sections you
  checked and which you did not. Echo audits Mapper's section, Mapper audits Echo's — §10b.
- **Done means demonstrated.** `URL → action → what I saw`, or `NOT verified: X` and why.
- The owner runs this from his phone. One screen, his words, one question, then stop.
