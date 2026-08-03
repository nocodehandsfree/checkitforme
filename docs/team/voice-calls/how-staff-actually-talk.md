# How Staff really talk (read off production, 2026-08-02)

Every line here is verbatim from a real check. 107 rows on production; 38 are real stores (69 are the
Fun store, excluded); 35 of those have a transcript; **14 reached a live person who spoke.** Counts
are out of those 14 unless stated. This is the source for the robot store's script
(`docs/specs/robot-store/README.md`) — the words there are these words, not invented ones.

## The greetings — all 14, in full

| What they said | Store |
|---|---|
| "Francis Noble, how can I help you?" | Barnes & Noble Calabasas |
| "Thanks for calling Barnes & Noble. Can I help you?" | Barnes & Noble Thousand Oaks |
| "Barnes & Noble Calabasas. How can I help you?" | Barnes & Noble Calabasas |
| "Good morning, Target American Fork. How can I help today?" | Target American Fork |
| "Good evening. Thank you for calling CVS. May I help you?" | CVS Agoura Hills |
| "Hey, welcome to CVS. How can I help you?" | CVS Oak Park |
| "Hello, this is CDS there speaking. How may I help you?" | CVS Agoura Rd (we misheard CVS) |
| "Hello, Seabass. How may I help you?" | CVS Victory Blvd (we misheard) |
| "CBS." | CVS Victory Blvd (we misheard CVS) |
| "Thank you for calling Walgreens." | Walgreens Tarzana |
| "Hi, how can I help you? Hello?" | Walgreens Cotati |
| "Thank you for holding. This is Staples. How can I help you? Hello?" | Staples Woodland Hills |
| "Mm-hmm." then "Hello? Hello?" | Barnes & Noble Calabasas |
| "I'm sorry. You're gonna have to call again. I can't hear you. Bye-bye." | Ace Hardware Agoura Hills |

Shapes: "How can I help you?" 5 · "How may I help you?" 3 · "Can I help you?" 1 · "How can I help
today?" 1 · **no offer of help at all 4** · leads with a name (theirs or the store's) 7 · **says
"Hello?" inside the first line because they cannot hear us 6** · time of day 2 · opens on a fragment
of another conversation 2.

## Yes — only two in the whole history

- "Yeah." → asked again: "We do." (CVS Victory Blvd)
- "We did, but it's not out yet, so... Uh, or I don't think it's out. Let me see." → "It's not out
  yet, but we did get some. Um, so you could maybe come by and see if it's out by the time you get
  here?" → asked what form: "It's like a box with, like, three packs in it, I think, or something
  like that." (Barnes & Noble Thousand Oaks)

**The only clean yes we have ever had is two words long.** The other one is wrapped inside a no.

## No — all seven

"We did not." · "No." · "Yeah, I did not see any, unfortunately." · "No, we don't have any this,
this shipment." · "No, I'm sorry. I haven't seen any yet." · "We did not receive any today." ·
"We haven't, as a matter of fact. Uh, let me double-check though. Hold on just a moment."

Shapes: starts with "No" 3 · "We did not / didn't / haven't" 4 · a softener attached 2 · the no
walked back into a check 1.

## Restock day — ZERO, ever

**No person has ever named a day, a date, or a time of day**, in any of the 35 real checks. The
stored restock day is empty on every row. The closest anything came: "you could maybe come by and
see if it's out by the time you get here."

## Walking away, and handing us on

**A person going to look:**
- "Uh, Pokémon? Uh, let me check. I just got in, so I have to, uh, I'll have to go up to the front
  and see. Okay, let me just put you on hold. Mm-hmm." → came back with "Okay, thank you for holding.
  Yeah, I did not see any, unfortunately." (the ONE hold that ever worked)
- "Um, give me just a second. Let me double-check." — never came back
- "Uh, let me double-check though. Hold on just a moment." — never came back
- "I don't think it's out. Let me see."

**A phone menu, not a person:** "Okay. Transferring you now." (CVS, 8 checks) · "Just a moment,
please. I'm looking up the information for you." (CVS, 9) · "Let me find someone to help you. Just
so you know, we're open every day from 8:00 a.m. to 10:00 p.m. Connecting you to the store."
(Walgreens Tarzana) · same with 7:00 a.m. to 11:00 p.m. (Walgreens Cotati).

**They hang up rather than hold:** "I'm sorry. You're gonna have to call again. I can't hear you.
Bye-bye." · "Hello? Hello? Um, try calling back. I can't hear you. I'm sorry."

## What we misheard, and where the answer came out wrong

**Words:** "CBS." and "this is CDS there speaking" and "Hello, Seabass." were all **CVS** · "Thank
you for calling CVS Pharmacy, Imas." · "Look, you are" (a cut-off goodbye).
The "Seabass" mishearing is now hard-coded into our own answer-reading code as a pattern to match.

**Run-ons:** check 114 welded four turns into one line with no space between them. Check 127 recorded
a store menu six times as ONE clerk line, 181 seconds long, words fused ("For window screens
andthe service department"). Check 106 is OUR side garbled: "Front." "Front." "Front store."
"Front." "Operator." "Four." and the Walgreens bot understood none of it.

**Wrong answers:**
- check 107 — "It's not out yet, but we did get some." → we recorded **no clear answer**. That is a
  yes, and we threw it away.
- check 135 — "We haven't... let me double-check though. Hold on just a moment." → we recorded
  **not in stock** before they came back. We never heard the answer.
- check 120 — "Let me double-check." → 121 seconds, never resolved.
- check 115 — our only IN STOCK in history rests on "Yeah." and "We do." No product, no count, no set.

## The three ways a check really goes wrong

1. **They pick up and cannot hear us — 6 of 14 (43%).** They talk into silence for two or three
   seconds and leave. A test store that answers cleanly and waits will never reproduce this.
2. **They walk away to look and we do not survive the silence — 3 of 14.** One worked. One never
   resolved. One we answered before they got back. A store that answers instantly never exercises
   the twenty to sixty second walk to the shelf.
3. **The answer arrives inside a sentence that starts the other way — 2 of 14 scored WRONG.** Staff
   correct themselves mid-sentence. A scripted "yes we have them" / "no we don't" store never
   produces the half-turn that actually breaks us.

Also real: they open on a fragment ("Mm-hmm.", "Okay.") · they give their own first name, not the
store's ("Francis Noble, how can I help you?").

## The biggest loss is not Staff at all

**19 of 33 real checks never reached a person** — they died inside a phone menu, mostly CVS and
Walgreens. That is a bigger hole than everything above put together, and it belongs to mapping, not
to how Staff talk.
