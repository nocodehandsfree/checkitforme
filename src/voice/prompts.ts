// Canonical, version-controlled agent prompts + voice tuning defaults.
//
// These are the source of truth for how the restock agent behaves. Apply them
// to the live ElevenLabs agent with `provider.updateAgent(agentId, {...})`
// (server endpoint: PATCH /api/voice-tuning, button: "Apply to agent").
//
// The tunable bits (opening line, the question, general-vs-specific) ride in on
// EXISTING dynamic variables ({{opening_line}}, {{clarification}}) so the owner
// can change them per-call without re-PATCHing the agent or touching the risky
// conversation_config_override path that used to hang calls up.

/**
 * CHARLIE'S INSTRUCTIONS — THE OWNER'S APPROVED REWRITE (approved 2026-08-04 and 2026-08-05).
 *
 * The spec, section by section with every original beside its ruling, is
 * `docs/specs/charlie-behavior/instructions-proposed.md`. His words are the spec: nothing here is
 * paraphrased and nothing is invented. 21 sections became 14 because the job moved out of Charlie —
 * Delta opens the check, Alpha and Bravo and mapping work the menu, Charlie is only switched on once
 * a live human is detected, and Admin owns every wait.
 *
 * INSERT OR NOTHING. Every conditional section is a dynamic variable that arrives as the words
 * themselves or as nothing at all, the pattern {{clarification}} already used. There are no "if the
 * flag below is true" prose switches left: a flag Charlie has to reason about is a rule he can get
 * wrong, and it cost the kiosk and wrong-department sections their reliability.
 *
 * The variables, and who fills them: {{category}} {{personality}} {{clarification}} {{kiosk_note}}
 * {{department_note}} {{set_example}} {{special_instructions}} — `buildRestockVars` (the bridge lane)
 * and `ElevenLabsProvider.startCall` (the direct lane), from the one set of builders below.
 *
 * NO DASHES ANYWHERE in what Charlie reads or says: they read strangely through ElevenLabs. A test
 * asserts it (scripts/test-prompts.ts) because a dash creeps back in every time somebody edits prose.
 */
export const RESTOCK_PROMPT = `You're on the phone with a Staff member at a retail store to find out if they have {{category}} in stock. You sound real, warm, and easygoing, never a call center, never a robot. Keep every reply to ONE short sentence. Talk like a friendly local who shops there.

Your personality
{{personality}}
(Personality shapes how you sound. It never overrides a rule.)

What you're trying to find out
You want ONE thing: can a customer walk in and buy {{category}} right now. Get that answer and get off the phone.
{{clarification}}
If nothing above says otherwise, ANY {{category}} in stock is a YES. Never make Staff confirm a set or type, and never send them off to look up details. If they say they have some right now, that's a YES. Don't be pushy. The set question below comes only after the yes is settled.

{{kiosk_note}}

{{department_note}}

A "let me check" is NOT your answer yet, WAIT for it. THIS IS CRITICAL. Staff very often give a quick gut reaction first ("I don't think so", "we haven't", "not that I know of") and THEN offer to actually check: "let me look", "let me double-check", "let me go see", "hold on a sec". That first off-the-cuff reaction is NOT the answer, and it is NOT a reason to hang up. The instant they say they'll check, reply with one warm line in your own words, like "no worries, take your time." The system holds the check while they're away and brings you back when a person is talking to you again. They're walking to the shelf or the back room; do NOT re-prompt them, rush them, or hang up while they're gone. ONLY the answer they give you AFTER they finish checking counts as your yes or no. Hanging up on a "let me check" is the worst thing you can do, you'll report the wrong answer.

Staff will often answer the recorded question with a story instead of a plain yes or no. "We had some this morning, they're gone" and "came in but all sold" both mean a customer cannot walk in and buy one right now. That is a NO, never unclear. Take it lightly in your own words, like "ah gotcha, no worries".

If Staff say they don't carry {{category}}, the store does not sell {{category}} at all. Nothing is in stock and no restock is coming. Take it lightly in your own words, like "oh okay, no worries".

Once the answer is settled, never confirm it again and never re-ask anything Staff already gave. On a yes, ask only what this check still needs, and ask it once and only once. The moment you have what the check needs, thank Staff warmly and end the check with end_call.

When Staff say the {{category}} is in stock, ask one question, in your own words, for the set name and whether it comes in packs, boxes, or tins. Example: "oh nice, do you know the name of the set, like {{set_example}}, and is it packs or a box or a tin?" Always keep a real set name in the question so Staff know what you mean. Take whatever they answer, even half of it, and never ask again, no matter how little they gave you. If they don't know the set name, thank them warmly and wrap up.

When Staff say nothing is in stock and have not said when more is coming, ask in your own words, in one sentence, what day and time more might come in, like "got it, do you know what day and time you might get more in?". Whatever Staff answer is the answer, even "soon". Never ask a second restock question.

One even, relaxed voice the whole call, the same on your first line, your questions, and your goodbye. At most ONE exclamation mark in an entire call, and never on the goodbye; sign offs land soft, like "Perfect, thanks so much, have a good one." Never say a dash in anything; write the beat with a comma instead, "thanks so much, have a good one". Vary your wording like a real person, never saying a line the exact same way twice; that is about how you phrase things, never permission to ask again. Never list options or sound scripted. Let Staff finish before you reply; if you are not sure they are done, wait. When nobody is talking to you, use skip_turn instead of speaking; never speak into a wait. If Staff speak Spanish, continue in Spanish. If they ask who's calling, you're just a regular customer checking on {{category}}.

{{special_instructions}}

End the check with one warm goodbye in your own words, like "perfect, thank you so much, have a good one". If Staff gave you their name, use it once during the check, either in a question or in your goodbye, whichever feels natural. Say goodbye once, then end the check with end_call.`;

/**
 * THE INSERTS. Every conditional section of Charlie's words is built here and arrives at the agent
 * as a dynamic variable holding either the words themselves or nothing at all.
 *
 * THE CATEGORY IS SUBSTITUTED HERE, NOT LEFT AS {{category}} FOR THE PROVIDER. A dynamic variable's
 * VALUE is not scanned for more variables, in the provider or in the Admin preview
 * (`previewStorePrompt` is a single pass by construction), so a "{{category}}" inside an inserted
 * section would reach Staff as those literal characters. Every builder below therefore takes the
 * category label and writes it in.
 */

/** Section 4, the kiosk stores. Inserted only on kiosk checks, nothing at all on every other check. */
export function kioskNote(category: string, kiosk: boolean): string {
  if (!kiosk) return "";
  const c = (category || "").trim() || "them";
  return `This store sells ${c} from a self-serve vending machine, not a shelf. A YES means the machine is on and working right now. Broken, unplugged, or "we don't have one" is a NO.`;
}

/**
 * Section 5, landing in the wrong department. Two texts, never nothing: a check that may ask to be
 * put through gets the whole rule, and a check that may not gets the one line that forbids it. The
 * flag is read HERE, once, off the same switch both lanes read, so Charlie is never handed a flag to
 * reason about (08-01: the prose switch is why he asked to be put through twice).
 */
export function departmentNote(category: string, mayAskForTransfer: boolean): string {
  const c = (category || "").trim() || "it";
  if (!mayAskForTransfer) {
    return `If Staff cannot answer about ${c}, never ask to be put through, take whatever answer they can give and wrap up.`;
  }
  return `If Staff cannot answer about ${c} (they say "this is the pharmacy", "this is photo", "that's a different department"), do not hang up and do not ask them to go look for you. Ask ONCE, warmly, "oh gotcha, could you put me through to whoever handles the ${c}?". Never ask a second time on a check. When somebody new picks up, your recorded question plays again and you carry on from their answer, exactly like the start of the call. If there is nobody to put you through to, or the new person cannot answer either, wrap up warmly and end_call.`;
}

/**
 * THE SET NAME IN SECTION 10'S EXAMPLE. **OWNER RULING 2026-08-05, DO NOT RE-LITIGATE: "we're not
 * using pitch black it literally is chaos rising and has never changed".**
 *
 * The builder note asked for an insert from the site's catalog so the example stays current, and the
 * first build of it read `data/pokemon-sets.json` and took the newest set already released, which is
 * Pitch Black. That was wrong. The example is Chaos Rising, it has never changed, and the catalog
 * cannot pick it: the products catalog carries 1,281 rows across every set ever printed, and the era
 * registry's "newest" moves every few weeks. So the example stays an INSERT, filled from here, and
 * this one line is where it changes if he ever changes it.
 *
 * Charlie varying it is NOT a fault (owner, same ruling): section 12 gives him leeway to say things
 * his own way, and that is deliberate. Nothing here forces him to read this name back word for word.
 */
export const SET_EXAMPLE = "Chaos Rising";

/**
 * WE LANDED IN THE WRONG DEPARTMENT — read off the words, because it cannot be read off the audio.
 *
 * The runtime spec (§10) says this in plain terms: the Ear cannot judge "wrong department", because
 * that needs somebody to understand *this is the pharmacy*, which is words. So it is NOT a second
 * listener and it is not audio maths — it is a phrase test on OUR OWN transcript, run in exactly the
 * place the voicemail phrases are already run, and it lives here beside the rule that tells the agent
 * what to do about it so the two can never drift apart.
 *
 * Deliberately narrow. A false positive files drift against a route that is fine, so it takes an
 * explicit statement (a named counter, a different department, being sent to the front) or an offer
 * to put us through. "The pharmacy is closed" and "let me check with the front" are NOT this.
 *
 * @param line one thing Staff said. @returns null, or a stable short reason plus what they said.
 */
/** `handingOver` = Staff did not merely tell us we are in the wrong place, they said they are moving
 *  us. That is the one reason that also predicts the NEXT wait, so the runtime can know a hand-over
 *  is coming without our agent having had to ask for it. Being told "this is the pharmacy" predicts
 *  nothing: we still have to ask, and until we do, a quiet pause is just somebody stepping away. */
export type WrongDepartment = { why: string; said: string; handingOver?: true };
/** Counters that answer for themselves and cannot see the shop floor. */
const OTHER_COUNTER = "pharmacy|photo(?: lab| centre| center)?|deli|bakery|optical|vision cent(?:er|re)|garden(?: cent(?:er|re))?|automotive|tire cent(?:er|re)|auto cent(?:er|re)|meat department|produce|money cent(?:er|re)|western union|salon|grooming|vet clinic";
export function heardWrongDepartment(line: string): WrongDepartment | null {
  const t = String(line || "").trim();
  if (!t) return null;
  const said = t.slice(0, 200);
  // ARE THEY MOVING US? Worked out ONCE, up here, and attached to whichever reason below fires,
  // because the two questions are not the same and one sentence can answer both. "Let me transfer you
  // to a different department" is a wrong department AND a hand-over already underway; it used to
  // match the wrong-department reason first and return, losing the fact that the phone was about to
  // change hands. That fact is what tells the runtime the next quiet stretch is a hand-over rather
  // than somebody stepping away, so losing it left the agent carrying on with a stranger.
  //
  // THE HAND-OVER WORD IS REQUIRED. It used to be optional, which made "put you" on its own enough,
  // so "I'm gonna put you on hold" — the single most common sentence a store says — was read as being
  // handed to another department (owner, test 1 on 07-31). Both halves have to be there now: the verb,
  // then either a direction (through / over / back) or a preposition that names who we are being given
  // to (to / with). "put you on hold", "can you hold", "let me put you down for one" no longer match;
  // "put you through", "transfer you to the pharmacy", "put you on with the manager" still do.
  const moving = /\b(?:transfer|put|get|connect|forward|send)(?:ring)?\s+(?:you|ya)\s+(?:(?:through|over|back)\b|(?:on\s+)?(?:to|with)\s)/i.test(t)
    && !/\bvoice ?mail|message\b/i.test(t);
  const hit = (why: string): WrongDepartment => (moving ? { why, said, handingOver: true } : { why, said });
  // A STORE ANSWERS WITH ITS OWN NAME AND NOTHING ELSE. "Pharmacy, this is Joe." "Photo, how can I
  // help?" "Deli." That is how a counter actually picks up the phone, and it was invisible here,
  // because every pattern below expects the name to arrive INSIDE a sentence ("this is the pharmacy").
  // Three of the owner's six test checks open exactly this way, so the save's own record would have
  // shown nothing on all three while the agent quietly did the right thing.
  //
  // The name has to END the clause, or run straight into a greeting. That is what keeps "The pharmacy
  // is closed right now but the store is open" out: the name is followed by more sentence, so nobody
  // announced themselves, they just mentioned a counter.
  if (new RegExp(`^(?:\\s*(?:hi|hey|hello|yeah|yes|thanks? (?:you )?for calling|good (?:morning|afternoon|evening))[\\s,!.]+)*(?:the\\s+)?(?:${OTHER_COUNTER})\\s*(?:[,.!?]|$|(?:speaking|this is|how (?:can|may) i)\\b)`, "i").test(t))
    return hit("Staff said we reached another counter");
  // They named where we actually are, and it is not the shop floor.
  if (new RegExp(`\\b(?:this is|you(?:'ve| have)? reached|you got|i'm in|we're)\\s+(?:the\\s+)?(?:${OTHER_COUNTER})\\b`, "i").test(t))
    return hit("Staff said we reached another counter");
  // They named it as the wrong place, without naming which place.
  if (/\b(?:wrong|different|another|other)\s+(?:department|desk|extension|counter|line)\b/i.test(t)
    || /\b(?:not|isn'?t|aren'?t|ain'?t|isnt|arent)\s+(?:the|my|our)\s+department\b/i.test(t))
    return hit("Staff said this is the wrong department");
  // They sent us to the front of the store, which is where we were trying to land.
  if (/\b(?:you(?:'ll| will)?\s+(?:want|need)|(?:you should|try|call|ask)\s+(?:the\s+)?)\s*(?:the\s+)?(?:front(?:\s+(?:store|end|desk|counter|of the store))?|main store|general (?:store|line)|customer service)\b/i.test(t))
    return hit("Staff said we want the front of the store");
  // They offered to hand us on. Landing somewhere that has to hand us on IS landing wrong.
  if (moving) return hit("Staff offered to put us through to somebody else");
  return null;
}

/**
 * THE AGENT ASKING TO BE HANDED ON. The mirror of the test above and the other half of the save: what
 * Staff said told us we landed wrong, and this says we did something about it.
 *
 * It matters far beyond a scorecard. Plenty of stores hand you on to a SILENT line, with no ringing at
 * all, and the audio detector can only ever see a quiet pause, which under twenty seconds reads as the
 * same person stepping away. The runtime would then tell the agent to carry on, and he would answer a
 * stranger mid sentence. Once he has ASKED to be put through, the next wait that ends is a hand-over
 * whatever it sounded like, and the words are the only thing that can say so.
 *
 * Never "transfer me to the pharmacy": the ask is always toward somebody who CAN answer.
 */
const ASK_TRANSFER = /\b(?:put (?:me|us) (?:through|thru)|transfer (?:me|us)|connect me|get me (?:through|over|to)|(?:who|whoever|someone|somebody|anyone) (?:who )?(?:handles|deals with|knows about|looks after|takes care of)|speak (?:to|with) (?:someone|somebody|whoever))\b/i;
export function askedToBePutThrough(line: string): boolean {
  return ASK_TRANSFER.test(String(line || ""));
}

/**
 * "THERE IS NOBODY TO PUT YOU THROUGH TO." The owner's fourth test, and the one place a wrong
 * department ends the check honestly rather than by nagging: he asks once, Staff say there is nobody
 * up front right now, and Charlie must wrap up warmly and go. Nothing wrote that moment down, so the
 * row that grades it had nothing to read.
 *
 * Only ever read AFTER he has asked to be put through, so an ordinary "there's nobody here who knows"
 * mid conversation cannot trip it. Words, never the ear (§10), and narrow on purpose: a false one of
 * these turns a check where somebody was transferring us into a check we gave up on.
 */
const NOBODY_TO_TRANSFER = new RegExp([
  "\\b(?:there(?:'s| is)|we(?:'ve| have)|i(?:'ve| have))?\\s*(?:no ?body|no one|nobody|not anybody)\\s+(?:up front|here|there|in|around|available|right now|at the moment|today|to (?:transfer|put|connect))",
  "\\b(?:no ?body|no one|nobody)(?:'s| is)?\\s+(?:up front|in|around|available|here)\\b",
  "\\bthere(?:'s| is) (?:no ?body|no one|nobody)\\b",
  "\\b(?:everyone|everybody) (?:is|has) (?:gone|left|out)\\b",
  "\\bi(?:'m| am) the only one (?:here|in)\\b",
  "\\bno (?:hay|est[aá]) nadie\\b",
].join("|"), "i");
export function saysNobodyToTransfer(line: string): boolean {
  return NOBODY_TO_TRANSFER.test(String(line || ""));
}

/**
 * A STORE'S RECORDED MENU, RECOGNISED BY ITS OWN WORDS (round 2, item 4).
 *
 * The owner sees this often: Staff hand us on and instead of another department we land back at the
 * recorded menu. The Ear cannot tell us that — a menu and a person are both just sound, and knowing
 * WHICH is words, which is why this lives here beside the other word tests rather than in the
 * listener (the runtime spec, section 10, is explicit about that line).
 *
 * A menu gives itself away by naming its own options, and it is deliberately the OPTIONS that count,
 * not politeness: "press", "for the pharmacy, say", "listen to the following options", "main menu",
 * "returning you to". A live person telling us to hold, or offering to put us through, says none of
 * that. Kept narrow on purpose — a false one of these makes a working hand-over read as a failure.
 *
 * Pure, so it is provable without a phone call: scripts/test-prompts.ts.
 */
const MENU_LINE = new RegExp([
  "\\bpress\\s+(?:the\\s+)?(?:[0-9]|one|two|three|four|five|six|seven|eight|nine|zero|pound|star)\\b",
  "\\bfor\\s+[a-z ]{3,30}?,?\\s+(?:press|say)\\b",
  "\\b(?:listen(?:\\s+carefully)?\\s+to|choose\\s+from)\\s+the\\s+following\\b",
  "\\bthe\\s+following\\s+options\\b",
  "\\b(?:main|previous)\\s+menu\\b",
  "\\breturning\\s+you\\s+to\\b",
  "\\bto\\s+repeat\\s+(?:these|this|the)\\s+(?:options|menu)\\b",
  "\\bplease\\s+(?:say|state)\\s+(?:the\\s+)?(?:name|reason)\\b",
].join("|"), "i");

export function looksLikeAMenu(line: string): boolean {
  return MENU_LINE.test(String(line || ""));
}

/**
 * WHO WE ARE TALKING TO (round 1, item 1.3). Staff give their name in the greeting more often than
 * not — "Fun store, this is Bob" — and Charlie thanking them BY NAME is one of the things the owner
 * grades a check on. Nothing wrote it down, so nothing could grade it.
 *
 * Deliberately narrow: only the shapes where somebody is plainly naming themselves, only one word,
 * and never a word that is obviously not a name. Wrong is worse than nothing here — a check would
 * claim he used their name when he used a word off the store's own sign.
 *
 * Pure, so it is provable without a phone call: scripts/test-prompts.ts.
 */
const NAME_LINE = /\b(?:this is|my name is|you(?:'re| are) speaking (?:with|to))\s+([a-z]{2,15})\b|\b([a-z]{2,15})\s+speaking\b/i;
const NOT_A_NAME = new Set([
  "the", "and", "for", "with", "here", "there", "just", "only", "still", "about",
  "store", "pharmacy", "customer", "service", "front", "desk", "manager", "team", "everyone",
  "him", "her", "them", "you", "they", "she", "one", "someone", "somebody", "nobody",
  "calling", "closed", "open", "sorry", "okay", "yes", "not", "sure", "fine", "good", "who",
]);
export function staffName(line: string): string | null {
  const m = NAME_LINE.exec(String(line || ""));
  const raw = (m?.[1] || m?.[2] || "").trim();
  if (!raw) return null;
  const low = raw.toLowerCase();
  if (NOT_A_NAME.has(low)) return null;
  return low.charAt(0).toUpperCase() + low.slice(1);
}

/**
 * CHARLIE WRAPPING UP (round 1, item 1.3). "The check ended without Charlie wrapping up" is a fail
 * on the owner's card, and until now nothing recorded whether he said goodbye at all — the check
 * simply stopped. These are the closing shapes his own instructions give him ("perfect, thank you
 * so much, have a good one!"), plus the ordinary ways anybody ends a call, in both languages.
 *
 * A thank-you in the MIDDLE of a conversation is not a wrap-up, which is why a bare "thanks" does
 * not count: it needs a goodbye or a well-wish beside it, the way a real ending does.
 */
const WRAP_UP = new RegExp([
  "\\bhave a (?:good|great|nice|lovely) (?:one|day|night|evening|weekend)\\b",
  "\\b(?:take care|goodbye|good bye|bye bye|bye now)\\b",
  // …and he says their name in the middle of it more often than not: "thanks Bob, bye".
  "\\bthanks?(?: you)?(?: so much| very much| again)?(?:[, ]+[a-z]{2,15})?[,! ]+(?:bye|goodbye|have a)\\b",
  "\\bappreciate (?:it|your help)[.,! ]*(?:thanks?|bye|have a)\\b",
  "\\bthat'?s (?:all|everything) i needed\\b",
  "\\bque teng(?:a|as)\\s+(?:un\\s+)?(?:buen|buena|lindo)\\b",
  "\\b(?:hasta luego|adi[oó]s|buen d[ií]a)\\b",
].join("|"), "i");
export function wrappedUp(line: string): boolean {
  return WRAP_UP.test(String(line || ""));
}
/**
 * HIS LAST WORDS, judged as an ending. A wrap-up in the MIDDLE of a conversation needs a goodbye
 * beside it (that is `wrappedUp` above, and it is what the live check records). But the LAST thing he
 * says is different: "Perfect, thank you so much!" and then the check ends IS a warm ending, and the
 * fail this row exists for is a check that simply stopped with nothing said at all. So the last line
 * gets the softer test, and only the last line.
 */
export function signedOff(lastLine: string): boolean {
  const t = String(lastLine || "").trim();
  if (!t || /\?\s*$/.test(t)) return false;      // a question is not an ending
  if (wrappedUp(t)) return true;
  return /\b(thanks|thank you|appreciate it|gracias)\b/i.test(t);
}

/** …and did he use their name while doing it. Whole word, so a name never matches inside another. */
export function usedTheirName(line: string, name: string | null): boolean {
  const n = String(name || "").replace(/[^a-z]/gi, "");
  if (!n) return false;
  return new RegExp(`\\b${n}\\b`, "i").test(String(line || ""));
}

/**
 * THE JOINING CHARLIE'S ONE EXTRA INSTRUCTION — AND THE ONE PLACE IT IS WRITTEN (owner 08-03).
 *
 * There are two Charlies in the account: the original, and the one every new style check actually
 * talks to, who joins a conversation the recorded question has already opened. Only the original was
 * ever sent the full words. The joining one was a frozen copy from 07-28 and never received the
 * wrong department section added on 08-01 — 17,521 characters against 16,807, and the difference was
 * exactly that section. That is why he asked to be put through twice: the rule telling him to ask
 * ONCE had never reached him.
 *
 * So the words now have ONE source. Whatever is pushed to the original is pushed to the joining one
 * with this on top, from the same build, and a test asserts the two are byte for byte that.
 *
 * Written the way the owner's prompt rules are written: no dashes inside a sentence, one register,
 * plain instructions.
 */
export const JOINING_RULE = `
YOU ARE JOINING A CALL THAT IS ALREADY IN PROGRESS.
A recorded line in your own voice has ALREADY asked the store: "{{opening_line}}"
The person on the line is answering that question right now.
Do NOT greet them. Do NOT introduce yourself. Do NOT ask the question again.
Your FIRST words must never be that question again in ANY wording. The store has already heard it,
and hearing it twice is what makes them hang up. If you are unsure what to say first, say nothing
and wait for their answer.
Say NOTHING until they have finished answering, then carry on from their answer exactly as you would
if you had asked it yourself. If they say something you did not catch, ask about that, never restart.
`.trim();

/** The joining Charlie's words: the joining instruction FIRST, so it is read before any instruction
 *  about opening a call, then the store rules unchanged. Pure, so what the push sends is provable
 *  without touching ElevenLabs (scripts/test-prompts.ts). */
export function joiningPrompt(base: string): string {
  return `${JOINING_RULE}\n\n${base}`;
}

/** EXACTLY what the joining Charlie is sent whenever the original is pushed. One function, so the
 *  words that go out and the words a test asserts can never be two different things. Pure: the only
 *  thing it needs from outside is which model the original was pushed with, so the two match. */
export function midCallAgentPatch(llm: string): { prompt: string; maxTokens: number; llm: string; turnEagerness: "patient" } {
  return {
    prompt: joiningPrompt(RESTOCK_PROMPT),
    maxTokens: VOICE_DEFAULTS.maxTokens,
    llm,
    // PATIENT STAYS (08-01 audit, open fault 1). On the new call shape every conversation is this
    // agent, and with early guessing on he answered EACH fragment of a split sentence — "no worries,
    // take your time" three times in a row — because our own machinery manufactures those fragments.
    turnEagerness: "patient",
  };
}

/** Spoken fallback when the pause-filler feature is on and no custom line is set. Copy law: no dash. */
export const SOFT_TIMEOUT_FALLBACK = "Yeah, hi, I'm here!";

/**
 * Section 3's {{clarification}}. Empty on a general check, which is what makes the line under it
 * ("if nothing above says otherwise, ANY {{category}} in stock is a YES") true by default. On a check
 * for one exact product it carries the owner's approved sentence, with the item the site's catalog
 * named written straight in.
 */
export function specificityClause(specificProduct?: string): string {
  const p = (specificProduct ?? "").trim();
  if (!p) return ""; // a general check: section 3 already says any of them counts
  return `A YES on this check means one exact item is in right now, anything else is a no. If yes or no is unclear, ask once, warmly, "do you have a ${p} in stock?".`;
}

/** TTS / cadence defaults for the cloned voice. Editable via the dashboard sliders. */
export const VOICE_DEFAULTS = {
  speed: 0.98,      // ~natural cadence — crisp, not drawn-out. 0.90 stretched the words and sounded slow. <1 slower, >1 faster
  stability: 0.40,  // lower = more expressive/varied inflection; higher = flatter/steadier
  similarityBoost: 0.85,
  modelId: "eleven_turbo_v2",
  maxTokens: 110,   // keep replies short
  llm: "claude-sonnet-4-6", // agent brain; swappable from the dashboard (Haiku/GPT/Gemini to cut cost)
};
