# HOW MENU NAVIGATION USED TO WORK — and the cheap way to get it back (2026-07-24)

**The owner is right. A model used to listen to the menu and speak the words. It was the ELEVENLABS
AGENT itself, on the line from pickup.** It was never a separate cheap LLM and it was never a
stopwatch. Three cost optimizations over five weeks moved the agent further and further from the
menu until nothing was listening, and the menu walk became a blind timer.

## The evidence

**1. The instructions are STILL in the agent's prompt** — `src/voice/prompts.ts:82-88`:

> "**If step-by-step directions for THIS store's phone system are given below, follow them EXACTLY,
> one prompt at a time** … Answer each prompt as it comes — don't rush them all at once."
> "If a system uses a keypad ('press 1 for…') instead, press the digit for the front/general store."
> `{{phone_tree}}`
> "When you hear these, you are still in the phone tree: navigate it (say the menu word — e.g.
> **'No' / 'Front' / 'General'** — or stay quiet and wait for the next prompt)."

Those are the exact words the owner remembers. The prompt still tells the agent how to walk a menu it
is no longer on the line to hear.

**2. `phoneTreeDefault` is written in plain English, for a reader.** Target's is literally
"To reach a live person: press 2, then press 2." That is not a machine plan — it is a note to an
agent, injected as `{{phone_tree}}` (`src/calls/service.ts:182, 236`). Chain → store override
(`retailers.phoneTree`) exists for the same reason.

**3. The commits that walked it back, in order:**

| When | Commit | What it did |
|---|---|---|
| Jun 22 | `7f67f5a1` | "VOICE injection — speak learned menu words (Polly TTS) **on a timer** before the stream… **Makes Bravo/CVS cheap (no agent during nav)**". Pure addition — before this, CVS had no spoken nav at all, because the AGENT was doing it. |
| Jul 23 | `9f78b95c` | "Real calls: **one nav source (map recipe)**" — presses and spoken words now derived from the recorded recipe on every call. |
| Jul 24 | `b1290194` / `5d56acc6` | Smart join: the ear is **deaf through the recipe**; the agent joins only after the plan finishes. |

Each step was a defensible cost fix. Together they removed the only thing that was listening.

**4. It is not a Twilio speech-recognition regression.** Speech-recognition spend is bursty and lands
only on mapping days ($23.42 on 07-10, $8.98 today, $0 on many days). Live checks never used it.
No third-party transcriber has ever existed in this repo — `git log -S` finds zero commits for
deepgram, whisper or assemblyai.

## Why we cannot simply put the agent back

The agent bills about $0.0014/second. A 40-second menu walk is **5.6¢ of agent time on its own**,
before the phone line, and the whole check has to land under 5¢. That is exactly why it was replaced.
Putting the agent back on the menu re-breaks the money, and the four "misses" this week were on
chains where the timer drifted — not where a listener failed.

## The cheap way to get it back: COUNT PROMPTS, NOT SECONDS

**We do not need to know what the menu SAYS. We already know that — it is the mapped recipe. We only
need to know WHEN each prompt ends.** That signal is already flowing and costs nothing.

The bridge already streams the store's audio from the moment of pickup and already analyses it:
Goertzel tone detection for ringback and modulation-based voice detection (`src/voice/bridge.ts`,
live today). A menu prompt is a burst of speech followed by a pause. Counting those bursts needs no
speech recognition, no LLM, and no agent — it is arithmetic on frames we already receive.

**So the recipe changes shape:** `press 2 @8s, press 2 @16s` becomes
`press 2 after prompt 1, press 2 after prompt 2`. Same mapping data we already collect — the mapper
already records which prompt each press followed (`reactivePress`, `navigator.ts:337-344`, logged as
"pressed 2 (after prompt 1)").

**Evidence this works, from today's 70 Target calls:** every `reactivePress` run landed its digit
correctly, across stores whose greeting ended anywhere from 9s (Austin) to 20s (Topanga). That 11
second spread is exactly what breaks a stopwatch and what a prompt counter does not notice.

**It fixes the owner's CVS example directly.** We would say "no" when the healthcare-provider question
actually finishes, not at a fixed 26s — the failure he heard.

**Cost: $0.00 added.** A 40s nav + 20s talk check stays at 4.3¢.

## The layers, cheapest first

1. **Prompt-counted recipe (free).** Fire each step after the Nth prompt instead of at the Nth second.
2. **Recipe timer as the floor/ceiling (free).** If no prompt boundary is detected by the learned
   time, fall back to firing on the clock — today's behaviour, as the safety net, not the plan.
3. **Store-level facts where we have them (free).** Target: `externalStoreId >= 3000` means the person
   is on 3, not 2 (blind test 11/11 today).
4. **Transcription, only if 1-3 leave a chain unsolved.** Never Twilio's `<Gather input="speech">` —
   measured at $0.02 per 15s interval, ~8.6¢ per call. Fork the audio we already stream to a
   non-Twilio transcriber and price it before building.
5. **The agent on the menu — never again by default.** 5.6¢ of agent time for a 40s walk.

## Not verified

- The prompt-counting trigger has not been built or measured on a live check. The claim it is free
  rests on the fact that the audio and the analysis already run; the accuracy of counting prompt
  boundaries on real store audio is untested.
- Whether the agent-navigates era actually stayed under 5¢ in practice. The rate card says it would
  not have.
- Zones need nothing extra: a zone store dials `bridgeStoreCall` exactly like a single check
  (`src/server.ts:3667`), so whatever lands on live checks lands on zones automatically.
