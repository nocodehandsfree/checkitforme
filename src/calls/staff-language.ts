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
// this decision hangs on. That is exactly why the Spanish recording has been sitting in the repo,
// approved, with nothing able to reach it.
//
// OFF THE WORDS, NEVER OFF THE SOUND (the same law the wrong-department save runs on): what language
// somebody is speaking is meaning, and the ear cannot judge meaning. This reads the line we wrote
// down and nothing else.
//
// PURE. No database, no config, no clock, no network, so it is unit-testable on its own
// (scripts/test-staff-language.ts).

/** Spanish letters no English greeting carries. One of these is enough on its own. */
const SPANISH_MARKS = /[¿¡ñáéíóú]/i;

/**
 * How a Spanish speaker actually answers a shop phone. Every one of these is a whole word or a
 * whole phrase, anchored, so an English sentence that happens to contain the letters cannot match:
 * "no" inside "nobody", "en" inside "when", "si" inside "since".
 */
const SPANISH_WORDS = new RegExp([
  // Greetings and the time of day, which is how most of them open.
  "\\b(buenas?|buenos)\\s+(d[ií]as?|tardes|noches)\\b",
  "\\bbuenas\\b", "\\bal[oó]\\b", "\\bd[ií]game\\b", "\\bbueno\\b\\s*[,.?!]",
  // Offering to help, which is the rest of a shop greeting.
  "\\ben qu[eé] (le |te )?puedo (ayudar|servir)\\b",
  "\\bc[oó]mo (le |te )?puedo ayudar\\b",
  "\\b(le|te) puedo ayudar\\b", "\\bpara servirle\\b",
  "\\bgracias por llamar\\b",
  // The short answers a check turns on.
  "\\bs[ií],? (se[ñn]or|se[ñn]ora|claro|tenemos)\\b",
  "\\btenemos\\b", "\\bno tenemos\\b", "\\bespere\\b", "\\bun momento\\b", "\\bd[eé]jeme\\b",
  // Naming the counter, the way a department answers.
  "\\bfarmacia\\b", "\\bla tienda\\b", "\\bqu[eé] desea\\b",
].join("|"), "i");

/**
 * Did the person who picked up speak to us in Spanish?
 *
 * Deliberately one-sided. A yes here swaps the recorded question to Spanish, so a false yes asks a
 * confused English speaker a question in a language they do not speak, which is worse than a false
 * no: a false no is simply today's behaviour, which works. So it takes real evidence, and anything
 * it cannot read is a no.
 */
export function staffSpokeSpanish(line: string | null | undefined): boolean {
  const t = String(line || "").trim();
  if (t.length < 3) return false;
  if (SPANISH_MARKS.test(t)) return true;
  return SPANISH_WORDS.test(t);
}
