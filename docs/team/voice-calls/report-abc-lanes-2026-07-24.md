# ALPHA / BRAVO / CHARLIE — what they are, who provides them, what shipped (2026-07-24)

Sources, all in this repo: `docs/finance/CHEAP_NAV_ARCHITECTURE.md` (owner-confirmed design,
2026-06-18) · `docs/finance/COST_MODEL.md` Part II (2026-07-02) · the Admin "How a call flows" panel
(`public/app.html:2128`) · `src/voice/bridge.ts`, `src/calls/recipe.ts`, `src/calls/navigator.ts`.

## The one idea behind all three

The expensive passenger is the live agent — ElevenLabs ConvAI plus its Claude brain, about
**8.4¢/minute together**. It bills the whole connected minute, including the 30 to 75 seconds spent
walking a phone menu, where its premium ears and timing **add zero value** — we are only picking a
menu word. The phone line alone is ~1.4¢/min, six times cheaper.

So: **Twilio carries the call, something cheap works the tree, and the agent is engaged ONLY once a
real person is on the line.** A/B/C are the three shapes that navigation can take. Every call ends
in Charlie; Alpha and Bravo are only how we reach the human.

## The three lanes

| Lane | Store type | How it navigates | Nav cost as designed |
|---|---|---|---|
| **Alpha** | keypad tree ("press 1 for…") | sends DTMF tones for the mapped digits | **$0** — tones are free |
| **Bravo** | spoken tree (CVS, Walgreens) | says the mapped menu words | **$0.013** as designed, **$0** as built |
| **Charlie** | rings a person directly | no navigation at all | $0 |

Assignment is automatic from what the mapper heard: `classifyMode()` in `navigator.ts:426` — all
presses = Alpha, any spoken word = Bravo, no steps at all = Charlie. It lands on the chain row as
`navType` (`keypad` / `voice` / `direct`) and the Admin reads it back as the lane name.

## Who provides what

| Piece | Provider | Rate | Verified? |
|---|---|---|---|
| The phone line, DTMF tones | **Twilio** | $0.014/min, **billed in whole minutes rounded up** | ✅ measured on 104 real calls, 07-24 |
| Bravo's spoken words | **Amazon Polly** via Twilio `<Say>` | bundled with the call | not separately billed |
| Audio fork (live listen) | **Twilio Media Streams** | $0.0044/min | ✅ measured 07-24 |
| Menu transcription (mapper only) | **Twilio speech recognition** | $0.02 per 15s interval, min 1 per listen | ✅ measured — $8.98 in one day |
| Charlie's voice + session | **ElevenLabs ConvAI** | Calc says $0.072/min · COST_MODEL says ~$0.10 · the code's credit basis says ~$0.22 | ❌ **never confirmed against an invoice** |
| Charlie's brain | **Claude Sonnet**, inside the EL session | $0.0002/s in Calc | ❌ not verified |
| Bravo's nav brain, as designed | **Claude Haiku** | $0.002/call budgeted | **never built** |
| Mapping brain (discovery only) | Gemini flash-lite, or Groq llama-3.3-70b | pennies | via `src/llm.ts` + Helicone |
| Delta's reply classifier | Groq llama-3.3-70b | $0.0004/call | shelved lane |

## What was designed vs what shipped — the gap that explains everything

**2026-06-18 — the design (`CHEAP_NAV_ARCHITECTURE.md`, owner-confirmed).** Bravo was specified as a
**listening loop**, quoted verbatim:

> "voice tree : cheap STT → **Haiku picks the word** → cheap TTS speaks it. **loop.**"
> "keypad : just send the DTMF digits. ~free."

Budget for the whole Bravo nav phase: Twilio STT $0.010 + Haiku $0.002 + TTS $0.001 = **$0.013**.
Human detection was specified too: finished the known tree → the next voice is the human; a human
goes off-script and Haiku classifies menu-vs-person; when unsure, engage the agent anyway as cheap
insurance. Status at the time: Alpha shipped, **"Then the voice-tree broker (STT + Haiku + cheap
TTS) — the CVS case, the biggest saver."** Not yet built.

**2026-06-22, four days later — `7f67f5a1` shipped something else.** "VOICE injection — speak learned
menu words (Polly TTS) **on a timer** before the stream… Makes Bravo/CVS cheap (no agent during
nav)." Same words, but fired on a stopwatch instead of chosen by listening. It was a pure addition,
which means that until that day CVS was navigated by **Charlie himself, on the line from dial** —
reliable and ~14.5¢.

**2026-07-02 — the timer became the doctrine.** `COST_MODEL.md` Part II now describes the nav segment
as: "**Nobody** — locked recipes replay via Twilio DTMF/TTS. **No AI.**" The Admin panel says the
same thing to this day: "Bravo — Says the menu words to navigate. Locked recipe, **zero AI**."

**The Haiku listening loop was never wired.** That is the missing piece between "it worked
beautifully" and "it fails on a stopwatch." The reliability came from Charlie being on the line; the
cheap lane removed Charlie and substituted a timer for the brain that was supposed to replace him.

## The target moved too

June 18 doc aims at **$0.09–$0.13 per check**. July 2 states the goal verbatim: **"by the time we
speak with an agent, they can talk for 30 seconds and we're five cents or less."** The 5¢ ceiling is
the later, tighter number — which is how Bravo's $0.013 listening budget got squeezed to $0.

## Numbers in our own docs that my measurements contradict

1. **Twilio STT budgeted at $0.010 for a whole nav phase.** Real: $0.02 per 15-second interval, so a
   40s Bravo nav is $0.06–$0.08. The designed Bravo would have missed its own budget by 5x **using
   Twilio's transcription**. It is only affordable with a non-Twilio transcriber, or with no
   transcriber at all.
2. **The Calc page bills the line per second.** Real: whole minutes rounded up — a cliff at 60s.
3. **ElevenLabs has three different rates in our own docs** ($0.072, ~$0.10, ~$0.22/min) and none is
   checked against an invoice. Charlie may cost 1.5–3x what the Calc page says. This is the single
   largest unknown in the whole model, and COST_MODEL Part I already flags it: "⭐ The ElevenLabs
   question (this decides everything)."

## What each lane needs to be right

- **Alpha** — needs the right digits and the right moment. The digits are mapped; the moment is what
  the stopwatch gets wrong.
- **Bravo** — same, plus the words. Designed to choose them by listening; today it recites them.
- **Charlie** — needs to join at the human and not one second earlier. That part now works: as of
  today the agent joins only on a real voice and ringing is identified by its tone frequencies.
