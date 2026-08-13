// WHAT LANGUAGE THE PERSON WHO PICKED UP IS SPEAKING, off the WORDS of their FIRST line.
//
// WHY THIS EXISTS AND WHY IT IS NOT `guessLanguage` (owner 08-07). We already had a language judge,
// in mapgraph.ts, and it is the right one for its job: it reads a MENU. Its Spanish markers are menu
// words ("para español", "oprima", "marque", "presione") and its English markers are menu words too,
// because a bilingual menu is an English opener with a Spanish option in it and reading that as pure
// Spanish maps the wrong menu.
//
// A PERSON SAYING HELLO SHARES NONE OF THAT VOCABULARY. "MVP's, buenas tardes. ¿En qué le puedo
// ayudar?" contains not one of those markers, so the menu judge answers "unknown" on the one line
// this decision hangs on. That is exactly why the Spanish recording sat in the repo, approved, with
// nothing able to reach it.
//
// ═══ WHAT WENT WRONG ON CHECK 359, AND THE RULE THAT REPLACED IT (owner 08-08) ═══
//
// The first cut of this decided Spanish on ACCENTED LETTERS: one of ¿ ¡ ñ á é í ó ú anywhere in the
// line was enough. On test check 359 the store answered "Larry Vásquez. How can I help you?", which
// is English, and the transcriber wrote the surname with its accent, so we asked a plain English
// speaker our question in Spanish. A Spanish surname is not a Spanish sentence.
//
// THE OWNER'S RULE, and it is now the whole of this file:
//   · Spanish is decided by WORDS. Never by accented letters, and NEVER by a name.
//   · "Larry Vásquez. How can I help you?" is ENGLISH.
//   · "MVP's, buenas tardes. ¿En qué le puedo ayudar?" is SPANISH.
//   · When it cannot tell, it is ENGLISH. The English recording is the safe wrong answer and the
//     Spanish one is the expensive wrong answer.
//
// TWO THINGS FOLLOW FROM "NEVER BY A NAME", and they are why the list below looks the way it does.
// Accents are STRIPPED before anything is matched, so a letter can no longer vote at all and the
// same word is found whether the transcriber wrote the accents or not. And nothing on the list is a
// bare NOUN a business can be called: "farmacia" and "la tienda" were on it and are gone, because
// "Farmacia Ramirez, how can I help you?" is an English greeting from a shop with a Spanish name.
// What is left is greetings, whole phrases and VERBS, which is what a person speaking Spanish says
// and what a sign over a door does not.
//
// OFF THE WORDS, NEVER OFF THE SOUND (the same law the wrong-department save runs on): what language
// somebody is speaking is meaning, and the ear cannot judge meaning. This reads the line we wrote
// down and nothing else.
//
// PURE. No database, no config, no clock, no network, so it is unit-testable on its own
// (scripts/test-staff-language.ts), and that test is fed the REAL line off check 359, accents and
// all, because the first version of it used the unaccented spelling from the robot store's script
// and so never once saw what the transcriber actually writes.

/** Accents off, lower case. A letter never decides anything now, so this exists only so the WORDS
 *  are found whether the transcriber wrote "buenas días" or "buenas dias". */
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * HOW A SPANISH SPEAKER ACTUALLY ANSWERS A SHOP PHONE. Matched against the accent-stripped line, so
 * every pattern is written without accents. Every one is anchored to whole words, so an English
 * sentence that happens to contain the letters cannot match: "no" inside "nobody", "en" inside
 * "when", "si" inside "since".
 *
 * NOT ONE OF THESE IS A NAME A SHOP CAN HAVE. That is the test for adding another: if it could be
 * painted on a sign, it does not belong here.
 */
const SPANISH_WORDS = new RegExp([
  // Greetings and the time of day, which is how most of them open.
  "\\b(buenas|buenos)\\s+(dias|tardes|noches)\\b",
  "\\bbuenas\\b", "\\bdigame\\b",
  // Offering to help, which is the rest of a shop greeting.
  "\\ben que (le |te )?puedo (ayudar|servir)\\b",
  "\\bcomo (le |te )?puedo ayudar\\b",
  "\\b(le|te) puedo ayudar\\b", "\\bpara servirle\\b",
  "\\bgracias por llamar\\b", "\\bque desea\\b",
  // The short answers a check turns on. Verbs, never nouns.
  "\\bsi,? (senor|senora|claro|tenemos)\\b",
  "\\btenemos\\b", "\\bespere\\b", "\\bun momento\\b", "\\bdejeme\\b", "\\bno hay nadie\\b",
].join("|"));

/**
 * Did the person who picked up speak to us in Spanish?
 *
 * Deliberately one-sided, and check 359 is why. A yes swaps the recorded question to Spanish, so a
 * false yes asks a confused English speaker a question in a language they do not speak. A false no
 * is simply today's behaviour, which works. So it takes real evidence, and anything it cannot read
 * is English.
 */
export function staffSpokeSpanish(line: string | null | undefined): boolean {
  const t = plain(String(line || "").trim());
  if (t.length < 3) return false;
  return SPANISH_WORDS.test(t);
}
